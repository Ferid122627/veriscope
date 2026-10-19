// Phase 3: evidence verification, the risk register and re-analysis integrity.
// The LLM is mocked so each case is deterministic; verification itself always
// runs against the real stored document text.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import {
  db,
  documentsTable,
  RISK_SEVERITIES,
  RISK_STATUSES,
  RISK_LIKELIHOODS,
  EVIDENCE_BASES,
  EVIDENCE_STATUSES,
  EVIDENCE_MATCH_TYPES,
  ASSESSMENT_KINDS,
  ASSESSMENT_VERDICTS,
  ANALYSIS_RUN_STATUSES,
} from "@workspace/db";
import * as api from "@workspace/api-zod";

vi.mock("../src/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ai/client")>();
  return { ...actual, requestStructuredCompletion: vi.fn() };
});

const { requestStructuredCompletion } = await import("../src/lib/ai/client");
const { default: app } = await import("../src/app");
const mockLlm = vi.mocked(requestStructuredCompletion);

process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??= "http://unused.test";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??= "unused";

const createdIds: number[] = [];
afterAll(async () => {
  if (createdIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdIds));
});
beforeEach(() => mockLlm.mockReset());

const SOURCE = [
  "VERISCOPE PHASE 3 FIXTURE.",
  "The data centre in Lisbon has no backup generator.",
  "Power outages in the region lasted up to six hours last year.",
  "Customer orders are processed only in Lisbon.",
  "The canteen menu changes weekly.",
].join("\n");

let seq = 0;
async function createDoc(title: string, content = SOURCE): Promise<number> {
  // Unique suffix so duplicate detection never collides between cases.
  const res = await request(app)
    .post("/api/documents")
    .send({ title, content: `${content}\nCase ${title} ${Date.now()}-${seq++}.` });
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body.id;
}

function aiRisk(overrides: Record<string, unknown> = {}) {
  return {
    title: "No backup power for the only processing site",
    description: "The single site processing orders has no backup generator.",
    category: "Operational",
    severity: "high",
    likelihood: "medium",
    businessImpact: "An outage would stop order processing.",
    recommendedMitigation: "Install a backup generator or add a second processing site.",
    evidenceQuotes: ["The data centre in Lisbon has no backup generator."],
    evidenceBasis: "direct",
    interpretationNote: null,
    rationale: "Stated directly.",
    confidence: 0.9,
    needsHumanReview: false,
    reviewNotes: null,
    matchesExistingRiskId: null,
    ...overrides,
  };
}

async function analyze(id: number, risks: unknown[], rerun = false) {
  mockLlm.mockResolvedValue(JSON.stringify({ risks }));
  const res = await request(app).post(`/api/documents/${id}/analyze`).send(rerun ? { rerun: true } : {});
  expect(res.status).toBe(202);
  for (let i = 0; i < 100; i++) {
    const doc = await request(app).get(`/api/documents/${id}`);
    if (doc.body.status !== "analyzing") return doc.body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("analysis did not finish");
}

async function onlyRisk(documentId: number) {
  const list = (await request(app).get(`/api/risks?documentId=${documentId}`)).body;
  expect(list).toHaveLength(1);
  return (await request(app).get(`/api/risks/${list[0].id}`)).body;
}

describe("evidence verification", () => {
  it("1. verifies a real quotation present in the source", async () => {
    const id = await createDoc("real quote");
    await analyze(id, [aiRisk()]);
    const risk = await onlyRisk(id);
    const doc = (await request(app).get(`/api/documents/${id}`)).body;

    expect(risk).toMatchObject({ evidenceStatus: "verified", evidenceBasis: "direct", reviewRequired: false, reviewReasons: [] });
    expect(risk.evidence).toHaveLength(1);
    const [e] = risk.evidence;
    expect(e).toMatchObject({ verified: true, matchType: "exact", matchCount: 1, normalizations: [], documentId: id });
    expect(doc.content.slice(e.startOffset, e.endOffset)).toBe(e.quote);
    expect(e.claimedQuote).toBe("The data centre in Lisbon has no backup generator.");
  });

  it("2. marks a fabricated quotation as not found and never as verified", async () => {
    const id = await createDoc("fabricated quote");
    // The AI claims a direct quote with high confidence; the text is not in the document.
    await analyze(id, [aiRisk({ evidenceQuotes: ["The Lisbon data centre failed its fire inspection in 2025."], confidence: 0.99 })]);
    const risk = await onlyRisk(id);

    expect(risk.evidenceStatus).toBe("unverified");
    expect(risk.verifiedEvidenceCount).toBe(0);
    expect(risk.reviewRequired).toBe(true);
    expect(risk.reviewReasons).toContain("The quotation could not be found in the source text.");
    expect(risk.evidence[0]).toMatchObject({
      verified: false,
      matchType: "not_found",
      startOffset: null,
      endOffset: null,
      pageNumber: null,
      matchCount: 0,
      quote: "The Lisbon data centre failed its fire inspection in 2025.",
    });
    // Filters agree with the stored status.
    const verifiedOnly = (await request(app).get(`/api/risks?documentId=${id}&evidenceStatus=verified`)).body;
    expect(verifiedOnly).toHaveLength(0);
  });

  it("3. shows every passage for a risk inferred from several excerpts and flags it as an interpretation", async () => {
    const id = await createDoc("multiple excerpts");
    await analyze(id, [
      aiRisk({
        title: "Regional outage would halt all order processing",
        evidenceBasis: "inferred",
        interpretationNote: "No generator, long regional outages and a single processing site together imply a full stop.",
        evidenceQuotes: [
          "The data centre in Lisbon has no backup generator.",
          "Power outages in the region lasted up to six hours last year.",
          "Customer orders are processed only in Lisbon.",
        ],
      }),
    ]);
    const risk = await onlyRisk(id);

    expect(risk).toMatchObject({ evidenceBasis: "inferred", evidenceStatus: "verified", evidenceCount: 3, verifiedEvidenceCount: 3 });
    expect(risk.interpretationNote).toMatch(/together imply/);
    expect(risk.evidence.map((e: { verified: boolean }) => e.verified)).toEqual([true, true, true]);
    expect(risk.reviewRequired).toBe(true);
    expect(risk.reviewReasons).toContain("The risk is an interpretation of several passages, not a direct quotation.");
  });

  it("4. keeps a finding with insufficient evidence but requires human review instead of inventing a quote", async () => {
    const id = await createDoc("insufficient evidence");
    // The AI says "direct" but gives no quote: the server records the basis as none.
    await analyze(id, [
      aiRisk({
        title: "No documented disaster recovery plan",
        evidenceQuotes: [],
        evidenceBasis: "direct",
        reviewNotes: "The document does not mention disaster recovery at all.",
      }),
    ]);
    const risk = await onlyRisk(id);

    expect(risk).toMatchObject({ evidenceBasis: "none", evidenceStatus: "no_evidence", evidenceCount: 0, reviewRequired: true });
    expect(risk.evidence).toEqual([]);
    expect(risk.reviewReasons[0]).toMatch(/No supporting quotation/);
    const needsReview = (await request(app).get(`/api/risks?documentId=${id}&reviewRequired=true`)).body;
    expect(needsReview.map((r: { id: number }) => r.id)).toEqual([risk.id]);
    const noReview = (await request(app).get(`/api/risks?documentId=${id}&reviewRequired=false`)).body;
    expect(noReview).toHaveLength(0);
  });

  it("5. completes cleanly for a document with no clear risks", async () => {
    const id = await createDoc("no risks", "VERISCOPE PHASE 3 FIXTURE.\nThe canteen menu changes weekly.");
    const doc = await analyze(id, []);

    expect(doc).toMatchObject({ status: "analyzed", riskCount: 0, analysisError: null });
    expect(doc.analysisRuns[0]).toMatchObject({ status: "completed", risksIdentified: 0, risksNew: 0, risksNotDetected: 0 });
    expect((await request(app).get(`/api/risks?documentId=${id}`)).body).toEqual([]);
  });

  it("6. risk detail returns the correct source document", async () => {
    const first = await createDoc("source A");
    const second = await createDoc("source B");
    await analyze(first, [aiRisk({ title: "Risk from document A" })]);
    await analyze(second, [aiRisk({ title: "Risk from document B" })]);

    for (const [docId, title] of [
      [first, "source A"],
      [second, "source B"],
    ] as const) {
      const risk = await onlyRisk(docId);
      expect(risk.documentId).toBe(docId);
      expect(risk.documentTitle).toBe(title);
      expect(risk.sourceDocument).toMatchObject({ id: docId, title, sourceType: "text", riskCount: 1 });
      expect(risk.evidence.every((e: { documentId: number }) => e.documentId === docId)).toBe(true);
      expect(risk.assessments[0].evidenceDocumentId).toBe(docId);
    }
  });

  it("records normalization and ambiguous locations", async () => {
    const id = await createDoc(
      "normalization",
      "VERISCOPE PHASE 3 FIXTURE.\nThe supplier\u2019s licence \u2013 valid until May \u2013 is not renewed.\nApproval pending.\nApproval pending.",
    );
    await analyze(id, [
      aiRisk({ evidenceQuotes: ["The supplier's licence - valid until May - is not renewed.", "Approval pending."] }),
    ]);
    const risk = await onlyRisk(id);
    const [normalized, ambiguous] = risk.evidence;
    expect(normalized).toMatchObject({ verified: true, matchType: "normalized", normalizations: ["quotes", "dashes"] });
    expect(normalized.quote).toBe("The supplier\u2019s licence \u2013 valid until May \u2013 is not renewed.");
    expect(normalized.claimedQuote).toBe("The supplier's licence - valid until May - is not renewed.");
    expect(ambiguous).toMatchObject({ verified: true, matchCount: 2 });
    expect(risk.reviewReasons[0]).toMatch(/appears 2 times/);
  });
});

describe("re-analysis integrity", () => {
  it("keeps risk ids, appends assessments, preserves earlier evidence and flags risks no longer detected", async () => {
    const id = await createDoc("rerun");
    await analyze(id, [
      aiRisk(),
      aiRisk({
        title: "Canteen menu volatility",
        severity: "low",
        evidenceQuotes: ["The canteen menu changes weekly."],
      }),
    ]);
    const before = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    const power = before.find((r: { title: string }) => r.title.startsWith("No backup power"));
    const canteen = before.find((r: { title: string }) => r.title === "Canteen menu volatility");

    // Second run: the AI matches the power risk by id (with a new title and severity),
    // reports one new risk, and does not report the canteen risk.
    const doc = await analyze(
      id,
      [
        aiRisk({
          title: "Single site without generator",
          severity: "critical",
          matchesExistingRiskId: power.id,
          evidenceQuotes: ["Customer orders are processed only in Lisbon."],
        }),
        aiRisk({ title: "Regional power instability", evidenceQuotes: ["Power outages in the region lasted up to six hours last year."] }),
      ],
      true,
    );

    expect(doc.analysisRuns[0]).toMatchObject({ status: "completed", risksIdentified: 2, risksNew: 1, risksMatched: 1, risksNotDetected: 1 });
    const after = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    expect(after).toHaveLength(3); // no duplicates, nothing deleted
    expect(after.map((r: { id: number }) => r.id)).toEqual(expect.arrayContaining([power.id, canteen.id]));

    const powerDetail = (await request(app).get(`/api/risks/${power.id}`)).body;
    expect(powerDetail.title).toBe(power.title); // stable title
    expect(powerDetail.severity).toBe("critical"); // current rating updated
    expect(powerDetail.assessments.map((a: { kind: string }) => a.kind)).toEqual(["reanalysis", "initial"]);
    expect(powerDetail.assessments.map((a: { severity: string }) => a.severity)).toEqual(["critical", "high"]);
    // Current evidence is the latest set; the earlier set stays on the initial assessment.
    expect(powerDetail.evidence.map((e: { quote: string }) => e.quote)).toEqual(["Customer orders are processed only in Lisbon."]);
    expect(powerDetail.assessments[1].evidence.map((e: { quote: string }) => e.quote)).toEqual([
      "The data centre in Lisbon has no backup generator.",
    ]);
    expect(powerDetail.actions).toHaveLength(1); // no duplicate mitigation action

    const canteenDetail = (await request(app).get(`/api/risks/${canteen.id}`)).body;
    expect(canteenDetail.status).toBe("open"); // not silently resolved
    expect(canteenDetail.assessments[0]).toMatchObject({ kind: "reanalysis", verdict: "not_detected" });
    expect(canteenDetail.reviewRequired).toBe(true);
    expect(canteenDetail.reviewReasons.at(-1)).toMatch(/Not detected when the document was re-analyzed/);
    // Earlier evidence is still shown as current, since no newer run identified the risk.
    expect(canteenDetail.evidence.map((e: { quote: string }) => e.quote)).toEqual(["The canteen menu changes weekly."]);

    // A third run that finds it again clears the not-detected flag.
    await analyze(
      id,
      [aiRisk({ title: "Canteen menu volatility", severity: "low", evidenceQuotes: ["The canteen menu changes weekly."] })],
      true,
    );
    const again = (await request(app).get(`/api/risks/${canteen.id}`)).body;
    expect(again.reviewRequired).toBe(false);
    expect(again.assessments.map((a: { verdict: string }) => a.verdict)).toEqual(["identified", "not_detected", "identified"]);
    expect((await request(app).get(`/api/risks?documentId=${id}`)).body).toHaveLength(3);
  });

  it("ignores an AI claim that a finding matches another document's risk", async () => {
    const other = await createDoc("other doc");
    await analyze(other, [aiRisk()]);
    const foreign = await onlyRisk(other);

    const id = await createDoc("claims foreign id");
    await analyze(id, [aiRisk({ matchesExistingRiskId: foreign.id })]);
    const risk = await onlyRisk(id);
    expect(risk.id).not.toBe(foreign.id);
    expect(risk.documentId).toBe(id);
    expect((await request(app).get(`/api/risks/${foreign.id}`)).body.assessments).toHaveLength(1);
  });
});

describe("shared vocabulary", () => {
  it("uses the same severity, status and evidence values in the database and the API contract", () => {
    // Nullable fields are generated as union([enum, null]); unwrap to the enum.
    const enumValues = (schema: unknown): string[] => {
      const s = schema as { options: unknown[] };
      const e = s.options.find((o) => Array.isArray((o as { options?: unknown }).options)) as { options: string[] } | undefined;
      return [...(e ? e.options : (s.options as string[]))].sort();
    };
    const riskItem = api.ListRisksResponseItem.shape;
    expect(enumValues(riskItem.severity)).toEqual([...RISK_SEVERITIES].sort());
    expect(enumValues(riskItem.status)).toEqual([...RISK_STATUSES].sort());
    expect(enumValues(riskItem.evidenceStatus)).toEqual([...EVIDENCE_STATUSES].sort());
    expect(enumValues(riskItem.likelihood)).toEqual([...RISK_LIKELIHOODS].sort());
    expect(enumValues(riskItem.evidenceBasis)).toEqual([...EVIDENCE_BASES].sort());
    // Detail schemas are generated as allOf (summary & extra fields): read the extra part.
    const extra = (schema: unknown) =>
      (schema as { _def: { right: { shape: Record<string, { element: { shape: Record<string, unknown> } }> } } })._def.right.shape;
    const evidence = extra(api.GetRiskResponse)["evidence"]!.element.shape;
    expect(enumValues(evidence.matchType)).toEqual([...EVIDENCE_MATCH_TYPES].sort());
    const assessment = extra(api.GetRiskResponse)["assessments"]!.element.shape;
    expect(enumValues(assessment.kind)).toEqual([...ASSESSMENT_KINDS].sort());
    expect(enumValues(assessment.verdict)).toEqual([...ASSESSMENT_VERDICTS].sort());
    const runs = extra(api.GetDocumentResponse)["analysisRuns"]!.element.shape;
    expect(enumValues(runs.status)).toEqual([...ANALYSIS_RUN_STATUSES].sort());
  });
});
