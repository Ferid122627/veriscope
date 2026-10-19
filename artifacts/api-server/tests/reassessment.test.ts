// Phase 4: mitigation actions, evidence-based reassessment and human approval.
// The LLM is mocked so each case is deterministic. Quote verification, the
// server's outcome rules and every status rule run for real against the DB.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { db, documentsTable } from "@workspace/db";
import type { StructuredRequest } from "../src/lib/ai/client";

vi.mock("../src/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ai/client")>();
  return { ...actual, requestStructuredCompletion: vi.fn() };
});

const { requestStructuredCompletion } = await import("../src/lib/ai/client");
const { default: app } = await import("../src/app");
const { applyReassessmentRules } = await import("../src/lib/reassessment-rules");
const { parseReassessmentOutput } = await import("../src/lib/ai/reassessment");
const mockLlm = vi.mocked(requestStructuredCompletion);

process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??= "http://unused.test";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??= "unused";

const createdIds: number[] = [];
afterAll(async () => {
  if (createdIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdIds));
});
beforeEach(() => mockLlm.mockReset());

const SOURCE = [
  "VERISCOPE PHASE 4 FIXTURE.",
  "The data centre in Lisbon has no backup generator.",
  "Customer orders are processed only in Lisbon.",
].join("\n");

let seq = 0;
const unique = () => `${Date.now()}-${seq++}`;

/** A risk created through the real analysis route (AI mocked), with its default action. */
async function setupRisk() {
  const doc = await request(app)
    .post("/api/documents")
    .send({ title: "phase 4 source", content: `${SOURCE}\nCase ${unique()}.` });
  expect(doc.status).toBe(201);
  createdIds.push(doc.body.id);
  mockLlm.mockResolvedValueOnce(
    JSON.stringify({
      risks: [
        {
          title: "No backup power for the only processing site",
          description: "The single site processing orders has no backup generator.",
          category: "Operational",
          severity: "high",
          likelihood: "medium",
          businessImpact: "An outage would stop order processing.",
          recommendedMitigation: "Install a backup generator at the Lisbon data centre.",
          evidenceQuotes: ["The data centre in Lisbon has no backup generator."],
          evidenceBasis: "direct",
          interpretationNote: null,
          rationale: "Stated directly.",
          confidence: 0.9,
          needsHumanReview: false,
          reviewNotes: null,
          matchesExistingRiskId: null,
          quoteSupport: "supports",
          supportGap: null,
        },
      ],
    }),
  );
  expect((await request(app).post(`/api/documents/${doc.body.id}/analyze`).send({})).status).toBe(202);
  for (let i = 0; i < 100; i++) {
    const d = await request(app).get(`/api/documents/${doc.body.id}`);
    if (d.body.status !== "analyzing") break;
    await new Promise((r) => setTimeout(r, 50));
  }
  const [summary] = (await request(app).get(`/api/risks?documentId=${doc.body.id}`)).body;
  const risk = (await request(app).get(`/api/risks/${summary.id}`)).body;
  expect(risk.status).toBe("open");
  return { sourceDocId: doc.body.id as number, risk };
}

function aiReassessment(overrides: Record<string, unknown> = {}) {
  return {
    outcome: "resolved",
    evidenceType: "operating_evidence",
    explanation: "The installation record and load test show the site now runs on backup power.",
    evidenceQuotes: [] as string[],
    requirementsMet: ["Generator installed", "Load test passed"],
    remainingGaps: [] as string[],
    nextSteps: ["Schedule quarterly generator tests"],
    confidence: 0.9,
    quoteSupport: "supports",
    conflictsWithEvidence: false,
    ...overrides,
  };
}

/** Submit pasted evidence, wait for the background run, return the risk detail. */
async function reassess(riskId: number, evidence: string, ai: unknown, fields: Record<string, string> = {}) {
  mockLlm.mockImplementationOnce(async (req: StructuredRequest) => {
    expect(req.schemaName).toBe("risk_reassessment");
    if (ai instanceof Error) throw ai;
    return JSON.stringify(ai);
  });
  let r = request(app).post(`/api/risks/${riskId}/reassessments`).field("content", `${evidence}\nRef ${unique()}.`);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  const res = await r;
  expect(res.status).toBe(202);
  createdIds.push(res.body.evidenceDocumentId);
  return { request: res.body, risk: await waitForRequest(riskId, res.body.id) };
}

async function waitForRequest(riskId: number, requestId: number) {
  for (let i = 0; i < 100; i++) {
    const risk = (await request(app).get(`/api/risks/${riskId}`)).body;
    const req = risk.reassessmentRequests.find((x: { id: number }) => x.id === requestId);
    if (req.status !== "pending") {
      // GET /risks/:id reads its sections in parallel on separate connections, so a
      // read that overlapped the run's commit can mix old and new rows (e.g. a
      // completed request without its assessment). The commit is finished now,
      // so one more read is a consistent snapshot.
      return (await request(app).get(`/api/risks/${riskId}`)).body;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("reassessment did not finish");
}

const GOOD_EVIDENCE = [
  "Facilities completion report.",
  "A diesel backup generator was installed at the Lisbon data centre on 3 March 2026.",
  "On 10 March 2026 the site ran on generator power for four hours during a load test with no interruption to order processing.",
].join("\n");

describe("mitigation actions", () => {
  it("creates, updates and deletes an action without ever changing the risk status", async () => {
    const { risk, sourceDocId } = await setupRisk();
    expect(risk.actions).toHaveLength(1);
    expect(risk.actions[0]).toMatchObject({ status: "open", evidenceNote: null, evidenceDocumentId: null });

    const created = await request(app).post(`/api/risks/${risk.id}/actions`).send({
      description: "Run a generator load test",
      owner: "Facilities — A. Costa",
      dueDate: "2026-12-15",
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ riskId: risk.id, status: "open", owner: "Facilities — A. Costa", dueDate: "2026-12-15" });

    const bad = await request(app).post(`/api/risks/${risk.id}/actions`).send({ description: "Bad date", dueDate: "2026-02-30" });
    expect(bad.status).toBe(400);

    const submitted = await request(app).patch(`/api/actions/${created.body.id}`).send({
      status: "submitted_for_review",
      evidenceNote: "Load test report attached.",
      evidenceDocumentId: sourceDocId,
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body).toMatchObject({
      status: "submitted_for_review",
      evidenceNote: "Load test report attached.",
      evidenceDocumentTitle: "phase 4 source",
    });
    expect(new Date(submitted.body.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(created.body.createdAt).getTime());

    const after = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(after.status).toBe("open"); // submitting an action never closes the risk
    expect(after.statusChanges).toEqual([]);

    expect((await request(app).delete(`/api/actions/${created.body.id}`)).status).toBe(204);
    expect((await request(app).patch(`/api/actions/${created.body.id}`).send({ status: "open" })).status).toBe(404);
  });
});

describe("reassessment", () => {
  it("valid operating evidence: recommends resolution, but only a human approval closes the risk", async () => {
    const { risk } = await setupRisk();
    const action = risk.actions[0];
    const { request: req, risk: after } = await reassess(
      risk.id,
      GOOD_EVIDENCE,
      aiReassessment({
        evidenceQuotes: [
          "A diesel backup generator was installed at the Lisbon data centre on 3 March 2026.",
          "On 10 March 2026 the site ran on generator power for four hours during a load test with no interruption to order processing.",
        ],
      }),
      { actionId: String(action.id), title: "Generator completion report" },
    );

    expect(req).toMatchObject({ riskId: risk.id, actionId: action.id, status: "pending", evidenceDocumentTitle: "Generator completion report" });
    expect(after.reassessmentRequests[0]).toMatchObject({ status: "completed", error: null });
    const latest = after.assessments[0];
    expect(latest).toMatchObject({
      kind: "reassessment",
      verdict: "resolved",
      aiVerdict: "resolved",
      evidenceType: "operating_evidence",
      guardrailNotes: [],
      actionId: action.id,
      evidenceDocumentId: req.evidenceDocumentId,
      decision: null,
    });
    expect(latest.evidence).toHaveLength(2);
    expect(latest.evidence.every((e: { verified: boolean; documentId: number }) => e.verified && e.documentId === req.evidenceDocumentId)).toBe(true);
    const evidenceDoc = (await request(app).get(`/api/documents/${req.evidenceDocumentId}`)).body;
    expect(evidenceDoc.purpose).toBe("evidence");
    for (const e of latest.evidence) expect(evidenceDoc.content.slice(e.startOffset, e.endOffset)).toBe(e.quote);

    // The AI's recommendation changes nothing on the risk; history is preserved.
    expect(after.status).toBe("open");
    expect(after.assessments.map((a: { kind: string }) => a.kind)).toEqual(["reassessment", "initial"]);
    expect(after.evidence.map((e: { quote: string }) => e.quote)).toEqual(["The data centre in Lisbon has no backup generator."]);

    // The prompt contained the original verified evidence and the action.
    const prompt = mockLlm.mock.calls.at(-1)![0].user;
    expect(prompt).toContain("The data centre in Lisbon has no backup generator.");
    expect(prompt).toContain("Install a backup generator at the Lisbon data centre.");

    // Accepting the recommendation is recorded, but still does not close the risk.
    const decided = await request(app).post(`/api/assessments/${latest.id}/decision`).send({ decision: "accepted", decidedBy: "Rita Alves", note: "Report checked." });
    expect(decided.status).toBe(200);
    expect(decided.body).toMatchObject({ decision: "accepted", decidedBy: "Rita Alves", verdict: "resolved" });
    expect((await request(app).post(`/api/assessments/${latest.id}/decision`).send({ decision: "rejected", decidedBy: "Someone" })).status).toBe(409);
    expect((await request(app).get(`/api/risks/${risk.id}`)).body.status).toBe("open");

    // Closing requires explicit approval and a justification.
    const close = (body: Record<string, unknown>) => request(app).post(`/api/risks/${risk.id}/status`).send({ status: "closed", ...body });
    expect((await close({ changedBy: "Rita Alves", note: "Verified generator test." })).status).toBe(400);
    expect((await close({ changedBy: "Rita Alves", approveClosure: true, note: "ok" })).status).toBe(400);
    const closed = await close({ changedBy: "Rita Alves", approveClosure: true, note: "Generator installed and load-tested.", assessmentId: latest.id });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ fromStatus: "open", toStatus: "closed", changedBy: "Rita Alves", assessmentId: latest.id });

    const final = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(final.status).toBe("closed");
    expect(final.statusChanges).toHaveLength(1);
    expect(final.assessments).toHaveLength(2); // nothing overwritten
    expect((await close({ changedBy: "Rita Alves", approveClosure: true, note: "Closing again please" })).status).toBe(409);
  });

  it("irrelevant evidence: an honest 'unresolved' is stored and the risk stays open", async () => {
    const { risk } = await setupRisk();
    const { risk: after } = await reassess(
      risk.id,
      "The staff canteen will introduce a vegetarian menu in April.",
      aiReassessment({
        outcome: "unresolved",
        evidenceType: "unrelated",
        evidenceQuotes: ["The staff canteen will introduce a vegetarian menu in April."],
        requirementsMet: [],
        remainingGaps: ["No evidence about backup power"],
        confidence: 0.95,
      }),
    );
    expect(after.assessments[0]).toMatchObject({ verdict: "unresolved", aiVerdict: "unresolved", guardrailNotes: [] });
    expect(after.status).toBe("open");
  });

  it("insufficient evidence: an AI claim of resolution is overruled by the server", async () => {
    const { risk } = await setupRisk();
    // A promise, which the AI wrongly calls resolution.
    const promise = await reassess(
      risk.id,
      "Facilities will install a backup generator before the end of next year.",
      aiReassessment({
        evidenceType: "plan_or_promise",
        evidenceQuotes: ["Facilities will install a backup generator before the end of next year."],
      }),
    );
    expect(promise.risk.assessments[0]).toMatchObject({ aiVerdict: "resolved", verdict: "unresolved" });
    expect(promise.risk.assessments[0].guardrailNotes[0]).toMatch(/plan or promise/);

    // Irrelevant text with a fabricated quotation, labelled as operating evidence.
    const fabricated = await reassess(
      risk.id,
      "Quarterly marketing newsletter. Our brand campaign reached two million viewers.",
      aiReassessment({ evidenceQuotes: ["The backup generator passed its load test on 10 March 2026."] }),
    );
    const a = fabricated.risk.assessments[0];
    expect(a).toMatchObject({ aiVerdict: "resolved", verdict: "needs_human_review" });
    expect(a.evidence[0]).toMatchObject({ verified: false, matchType: "not_found", startOffset: null });
    expect(a.guardrailNotes.join(" ")).toMatch(/could be found/);

    // A policy document is not proof that the control operates.
    const policy = await reassess(
      risk.id,
      "Policy FAC-7: every data centre must have backup power.",
      aiReassessment({ evidenceType: "policy_or_design", evidenceQuotes: ["Policy FAC-7: every data centre must have backup power."] }),
    );
    expect(policy.risk.assessments[0]).toMatchObject({ aiVerdict: "resolved", verdict: "partially_resolved" });

    const verdicts = policy.risk.assessments.map((x: { verdict: string }) => x.verdict);
    expect(verdicts).toEqual(["partially_resolved", "needs_human_review", "unresolved", "identified"]);
    expect(policy.risk.status).toBe("open");
  });

  it("ambiguous evidence: needs human review is stored as such", async () => {
    const { risk } = await setupRisk();
    const contradictory = [
      "Site report A: a generator was delivered to Lisbon on 3 March 2026.",
      "Site report B: no generator is present at the Lisbon data centre as of 5 March 2026.",
    ].join("\n");
    const { risk: after } = await reassess(
      risk.id,
      contradictory,
      aiReassessment({
        outcome: "needs_human_review",
        evidenceType: "mixed",
        explanation: "The two site reports contradict each other about whether a generator is present.",
        evidenceQuotes: [
          "Site report A: a generator was delivered to Lisbon on 3 March 2026.",
          "Site report B: no generator is present at the Lisbon data centre as of 5 March 2026.",
        ],
        requirementsMet: [],
        remainingGaps: ["Confirm whether the generator is installed"],
        confidence: 0.4,
      }),
    );
    expect(after.assessments[0]).toMatchObject({ verdict: "needs_human_review", aiVerdict: "needs_human_review" });
    expect(after.assessments[0].evidence.map((e: { verified: boolean }) => e.verified)).toEqual([true, true]);
    expect(after.status).toBe("open");
  });

  it("AI provider failure: records the failure and leaves the risk and its history untouched", async () => {
    const { risk } = await setupRisk();
    const { risk: after } = await reassess(risk.id, GOOD_EVIDENCE, new Error("provider exploded"));

    expect(after.reassessmentRequests[0]).toMatchObject({ status: "failed", assessmentId: null });
    expect(after.reassessmentRequests[0].error).toMatch(/reassessment failed/);
    expect(after.status).toBe("open");
    expect(after.assessments).toEqual(risk.assessments);
    expect(after.evidence).toEqual(risk.evidence);
    expect(after.actions).toEqual(risk.actions);
    expect(after.updatedAt).toBe(risk.updatedAt);
  });

  it("rejects invalid requests without starting a run", async () => {
    const { risk, sourceDocId } = await setupRisk();
    const post = () => request(app).post(`/api/risks/${risk.id}/reassessments`);

    expect((await post().field("content", "")).status).toBe(400); // no evidence
    expect((await post().field("content", "Some evidence text").field("documentId", String(sourceDocId))).status).toBe(400); // two kinds
    const own = await post().field("documentId", String(sourceDocId));
    expect(own.status).toBe(400); // the source document is not new evidence
    expect(own.body.error).toMatch(/new evidence/);
    expect((await post().field("content", "Evidence text here").field("actionId", "999999999")).status).toBe(404);
    expect((await request(app).post(`/api/risks/999999999/reassessments`).field("content", "Evidence text")).status).toBe(404);

    // AI not configured: 503 and no evidence document is stored.
    const saved = { url: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"], key: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] };
    delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    const marker = `Unconfigured evidence ${unique()}`;
    try {
      const res = await post().field("content", marker);
      expect(res.status).toBe(503);
    } finally {
      process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = saved.url;
      process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = saved.key;
    }
    const docs = (await request(app).get("/api/documents")).body as { title: string; id: number }[];
    expect(docs.some((d) => d.title === marker)).toBe(false);

    expect(mockLlm).toHaveBeenCalledTimes(1); // only the setup analysis
    expect((await request(app).get(`/api/risks/${risk.id}`)).body.reassessmentRequests).toEqual([]);
  });

  it("allows only one running reassessment per risk and accepts an uploaded file", async () => {
    const { risk } = await setupRisk();
    let release!: () => void;
    // The reassessment runs in the background after the 202 response, so the mock
    // is only called later. This promise resolves once it has been called and
    // `release` is initialized.
    let markCalled!: () => void;
    const llmCalled = new Promise<void>((resolve) => {
      markCalled = resolve;
    });
    mockLlm.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(JSON.stringify(aiReassessment({ outcome: "unresolved", remainingGaps: ["x gap"] })));
          markCalled();
        }),
    );
    const first = await request(app)
      .post(`/api/risks/${risk.id}/reassessments`)
      .attach("file", Buffer.from(`Generator purchase order raised. Ref ${unique()}.`), "purchase-order.txt");
    expect(first.status).toBe(202);
    createdIds.push(first.body.evidenceDocumentId);
    expect(first.body.evidenceDocumentTitle).toBe("purchase-order");

    const second = await request(app).post(`/api/risks/${risk.id}/reassessments`).field("content", `More evidence ${unique()}`);
    expect(second.status).toBe(409);

    await llmCalled;
    release();
    const after = await waitForRequest(risk.id, first.body.id);
    expect(after.reassessmentRequests).toHaveLength(1);
    expect(after.assessments[0]).toMatchObject({ verdict: "unresolved" });
  });

  it("status changes: reopening is recorded with the previous status", async () => {
    const { risk } = await setupRisk();
    const change = (body: Record<string, unknown>) => request(app).post(`/api/risks/${risk.id}/status`).send(body);
    expect((await change({ status: "mitigating", changedBy: " " })).status).toBe(400);
    expect((await change({ status: "open", changedBy: "Rita Alves" })).status).toBe(409);
    expect((await change({ status: "mitigating", changedBy: "Rita Alves" })).status).toBe(200);
    expect((await change({ status: "closed", changedBy: "Rita Alves", approveClosure: true, note: "Accepted residual risk." })).status).toBe(200);
    expect((await change({ status: "open", changedBy: "Ana Lopes", note: "Generator failed again." })).status).toBe(200);
    const after = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(after.status).toBe("open");
    expect(after.statusChanges.map((c: { fromStatus: string; toStatus: string }) => `${c.fromStatus}>${c.toStatus}`)).toEqual([
      "closed>open",
      "mitigating>closed",
      "open>mitigating",
    ]);
  });
});

describe("outcome rules", () => {
  const base = {
    outcome: "resolved",
    evidenceType: "operating_evidence",
    remainingGaps: [],
    confidence: 0.9,
    quoteSupport: "supports",
    conflictsWithEvidence: false,
  } as const;
  const run = (ai: Partial<typeof base> & Record<string, unknown>, total = 2, verified = 2) =>
    applyReassessmentRules({ ai: { ...base, ...ai } as never, quotesTotal: total, quotesVerified: verified }).verdict;

  it("keeps resolution only when every condition holds", () => {
    expect(run({})).toBe("resolved");
    expect(run({}, 0, 0)).toBe("needs_human_review");
    expect(run({}, 2, 1)).toBe("needs_human_review");
    expect(run({ confidence: 0.5 })).toBe("needs_human_review");
    expect(run({ remainingGaps: ["gap"] as never })).toBe("partially_resolved");
    expect(run({ evidenceType: "policy_or_design" as never })).toBe("partially_resolved");
    expect(run({ evidenceType: "mixed" as never })).toBe("partially_resolved");
    expect(run({ evidenceType: "plan_or_promise" as never })).toBe("unresolved");
    expect(run({ evidenceType: "unrelated" as never })).toBe("unresolved");
    expect(run({ outcome: "partially_resolved" as never, evidenceType: "unrelated" as never })).toBe("unresolved");
  });

  it("never upgrades an outcome", () => {
    for (const outcome of ["partially_resolved", "unresolved", "needs_human_review"] as const) {
      expect(run({ outcome: outcome as never })).toBe(outcome);
    }
  });
});

describe("reassessment guardrails: conflict and quote support", () => {
  const base = {
    outcome: "resolved",
    evidenceType: "operating_evidence",
    remainingGaps: [] as string[],
    confidence: 0.9,
    quoteSupport: "supports",
    conflictsWithEvidence: false,
  };
  const apply = (ai: Record<string, unknown>, total = 2, verified = 2) =>
    applyReassessmentRules({ ai: { ...base, ...ai } as never, quotesTotal: total, quotesVerified: verified });

  it("downgrades resolved and partially resolved to needs_human_review when the evidence conflicts", () => {
    for (const outcome of ["resolved", "partially_resolved"]) {
      const r = apply({ outcome, conflictsWithEvidence: true, remainingGaps: outcome === "resolved" ? [] : ["gap"] });
      expect(r.verdict).toBe("needs_human_review");
      expect(r.notes.join(" ")).toMatch(/conflicting statements/);
    }
  });

  it("treats a missing or malformed conflict flag as unknown, never as 'no conflict'", () => {
    for (const conflictsWithEvidence of ["invalid", undefined]) {
      const r = apply({ conflictsWithEvidence });
      expect(r.verdict).toBe("needs_human_review");
      expect(r.notes.join(" ")).toMatch(/did not give a valid answer/);
    }
  });

  it("does not accept resolved unless quote support is exactly 'supports'", () => {
    const notes: Record<string, RegExp> = {
      partial: /only partly establish/,
      does_not_support: /do not establish/,
      invalid: /did not give a valid assessment/,
    };
    for (const [quoteSupport, re] of Object.entries(notes)) {
      const r = apply({ quoteSupport });
      expect(r.verdict, quoteSupport).toBe("needs_human_review");
      expect(r.notes.join(" "), quoteSupport).toMatch(re);
    }
    const missing = apply({ quoteSupport: undefined });
    expect(missing.verdict).toBe("needs_human_review");
    expect(missing.notes.join(" ")).toMatch(/did not give a valid assessment/);
    expect(apply({}).verdict).toBe("resolved");
  });

  it("leaves a weaker outcome alone: weak quote support does not touch partially_resolved", () => {
    const r = apply({ outcome: "partially_resolved", remainingGaps: ["gap"], quoteSupport: "partial" });
    expect(r).toEqual({ verdict: "partially_resolved", notes: [] });
  });

  it("no combination of guardrail inputs can upgrade a verdict", () => {
    const progress = { resolved: 2, partially_resolved: 1, unresolved: 0, needs_human_review: 0 } as const;
    const outcomes = ["resolved", "partially_resolved", "unresolved", "needs_human_review"] as const;
    let checked = 0;
    for (const outcome of outcomes)
      for (const evidenceType of ["operating_evidence", "policy_or_design", "plan_or_promise", "unrelated", "mixed"])
        for (const quoteSupport of ["supports", "partial", "does_not_support", "invalid", undefined])
          for (const conflictsWithEvidence of [true, false, "invalid", undefined])
            for (const [total, verified] of [[0, 0], [2, 1], [2, 2]])
              for (const remainingGaps of [[], ["gap"]])
                for (const confidence of [0.3, 0.9]) {
                  const { verdict, notes } = apply(
                    { outcome, evidenceType, quoteSupport, conflictsWithEvidence, remainingGaps, confidence },
                    total,
                    verified,
                  );
                  checked++;
                  expect(progress[verdict]).toBeLessThanOrEqual(progress[outcome]);
                  if (outcome === "unresolved" || outcome === "needs_human_review") expect(verdict).toBe(outcome);
                  // Every change is explained.
                  if (verdict !== outcome) expect(notes.length).toBeGreaterThan(0);
                }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe("parseReassessmentOutput: guardrail field validation", () => {
  const valid = {
    outcome: "resolved",
    evidenceType: "operating_evidence",
    explanation: "The signed agreement shows the control is in place.",
    evidenceQuotes: ["The agreement was signed on 2 October 2026."],
    requirementsMet: ["Signed DPA"],
    remainingGaps: [],
    nextSteps: ["Review annually"],
    confidence: 0.9,
  };
  const parse = (extra: Record<string, unknown>) => parseReassessmentOutput(JSON.stringify({ ...valid, ...extra }));

  it("keeps valid values", () => {
    expect(parse({ quoteSupport: "supports", conflictsWithEvidence: false })).toMatchObject({
      quoteSupport: "supports",
      conflictsWithEvidence: false,
    });
    expect(parse({ quoteSupport: "partial", conflictsWithEvidence: true })).toMatchObject({
      quoteSupport: "partial",
      conflictsWithEvidence: true,
    });
  });

  it("never defaults a missing or malformed value to a safe-looking answer", () => {
    expect(parse({ conflictsWithEvidence: false })).toMatchObject({ quoteSupport: "invalid", conflictsWithEvidence: false });
    expect(parse({ quoteSupport: "supports" })).toMatchObject({ quoteSupport: "supports", conflictsWithEvidence: "invalid" });
    expect(parse({ quoteSupport: "yes", conflictsWithEvidence: "no" })).toMatchObject({
      quoteSupport: "invalid",
      conflictsWithEvidence: "invalid",
    });
    expect(parse({ quoteSupport: "supports", conflictsWithEvidence: "false" }).conflictsWithEvidence).toBe("invalid");
    expect(parse({ quoteSupport: "supports", conflictsWithEvidence: 0 }).conflictsWithEvidence).toBe("invalid");
    expect(parse({ quoteSupport: "supports", conflictsWithEvidence: null }).conflictsWithEvidence).toBe("invalid");
  });
});

describe("reassessment guardrails end to end (mocked AI)", () => {
  const A = "Procurement tracker, 1 October 2026: the data processing agreement with Northwind is signed and filed.";
  const B = "Legal Operations, 8 October 2026: no countersigned data processing agreement has been received from Northwind.";

  it("a mocked AI that says resolved despite conflicting evidence is downgraded, with its original verdict kept", async () => {
    const { risk } = await setupRisk();
    const { risk: after } = await reassess(
      risk.id,
      `${A}\n${B}`,
      // Verified quote, operating evidence, no gaps, high confidence, and still wrong.
      aiReassessment({ evidenceQuotes: [A], conflictsWithEvidence: true }),
    );
    const a = after.assessments[0];
    expect(a).toMatchObject({ kind: "reassessment", aiVerdict: "resolved", verdict: "needs_human_review", decision: null });
    expect(a.evidence.map((e: { verified: boolean }) => e.verified)).toEqual([true]);
    expect(a.guardrailNotes.join(" ")).toMatch(/conflicting statements/);
    expect(after.status).toBe("open");
  });

  it("resolved with partial or invalid quote support is downgraded; the AI's own verdict is preserved", async () => {
    for (const [label, overrides, re] of [
      ["partial", { quoteSupport: "partial" }, /only partly establish/],
      ["does_not_support", { quoteSupport: "does_not_support" }, /do not establish/],
      ["missing quoteSupport", { quoteSupport: undefined }, /did not give a valid assessment/],
      ["unknown quoteSupport", { quoteSupport: "strong" }, /did not give a valid assessment/],
    ] as const) {
      const { risk } = await setupRisk();
      const { risk: after } = await reassess(risk.id, A, aiReassessment({ evidenceQuotes: [A], ...overrides }));
      const a = after.assessments[0];
      expect(a, label).toMatchObject({ aiVerdict: "resolved", verdict: "needs_human_review" });
      expect(a.guardrailNotes.join(" "), label).toMatch(re);
      expect(after.status, label).toBe("open");
    }
  });

  it("a missing or malformed conflict flag blocks resolution instead of being read as 'no conflict'", async () => {
    for (const conflictsWithEvidence of [undefined, "false", null]) {
      const { risk } = await setupRisk();
      const { risk: after } = await reassess(risk.id, A, aiReassessment({ evidenceQuotes: [A], conflictsWithEvidence }));
      expect(after.assessments[0], String(conflictsWithEvidence)).toMatchObject({ aiVerdict: "resolved", verdict: "needs_human_review" });
      expect(after.assessments[0].guardrailNotes.join(" ")).toMatch(/did not give a valid answer/);
    }
  });

  it("clean, supported, conflict-free operating evidence is still accepted as a recommendation (and the risk still stays open)", async () => {
    const { risk } = await setupRisk();
    const { risk: after } = await reassess(risk.id, A, aiReassessment({ evidenceQuotes: [A] }));
    expect(after.assessments[0]).toMatchObject({ aiVerdict: "resolved", verdict: "resolved", guardrailNotes: [] });
    expect(after.status).toBe("open");
  });
});
