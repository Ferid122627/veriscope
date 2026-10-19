// Company rules (playbook), related standards, draft clauses and the
// compliance score. The LLM is mocked so the saved fields can be checked exactly.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { db, documentsTable, playbooksTable } from "@workspace/db";

vi.mock("../src/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ai/client")>();
  return { ...actual, requestStructuredCompletion: vi.fn() };
});

const { requestStructuredCompletion } = await import("../src/lib/ai/client");
const { default: app } = await import("../src/app");
const { computeCompliance, SCORE_DEDUCTIONS } = await import("../src/lib/compliance-score");
const { MAX_PLAYBOOK_CHARS } = await import("../src/lib/playbook");
const { mergeRisks } = await import("../src/lib/analysis-runner");
const { parseAnalysisOutput } = await import("../src/lib/ai/risk-analysis");
const mockLlm = vi.mocked(requestStructuredCompletion);

process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??= "http://unused.test";
process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??= "unused";

const RULES =
  "ACME PURCHASING RULES\n1. Payment terms must not exceed 30 days from invoice.\n2. Every supplier contract must include a data protection clause.";

const createdIds: number[] = [];
afterAll(async () => {
  if (createdIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdIds));
  await db.delete(playbooksTable);
});
beforeEach(() => mockLlm.mockReset());

async function createDoc(content: string): Promise<number> {
  const res = await request(app).post("/api/documents").send({ title: "Playbook test", content });
  expect(res.status).toBe(201);
  createdIds.push(res.body.id);
  return res.body.id;
}

async function waitForAnalysis(id: number) {
  for (let i = 0; i < 100; i++) {
    const res = await request(app).get(`/api/documents/${id}`);
    if (res.body.status !== "analyzing") return res.body;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("analysis did not finish");
}

function aiRisk(overrides: Record<string, unknown> = {}) {
  return {
    title: "Payment term longer than company policy",
    description: "The contract allows the supplier to be paid 90 days after invoice.",
    category: "Financial",
    severity: "medium",
    likelihood: "medium",
    riskKind: "potential_risk",
    severityReason: "Longer terms than allowed affect cash flow planning.",
    businessImpact: "Payments fall outside the approved policy.",
    recommendedMitigation: "Renegotiate the payment term to 30 days.",
    evidenceQuotes: ["Invoices are payable within 90 days."],
    evidenceBasis: "direct",
    interpretationNote: null,
    rationale: "The quote states 90 days.",
    confidence: 0.9,
    needsHumanReview: false,
    reviewNotes: null,
    matchesExistingRiskId: null,
    quoteSupport: "supports",
    supportGap: null,
    playbookRuleQuote: "Payment terms must not exceed 30 days from invoice.",
    playbookGap: "The contract allows 90 days; the rule allows at most 30.",
    regulations: [],
    suggestedClause: "The Customer shall pay each undisputed invoice within thirty (30) days of receipt.",
    suggestedClauseTarget: "Clause 4 (Payment)",
    ...overrides,
  };
}

describe("compliance score", () => {
  it("deducts per open risk by severity, never below zero", () => {
    const r = (severity: "critical" | "high" | "medium" | "low", status = "open", evidenceStatus = "verified") => ({ severity, status, evidenceStatus });
    expect(computeCompliance([]).score).toBe(100);
    const b = computeCompliance([r("critical"), r("high"), r("medium"), r("low")]);
    expect(b.score).toBe(100 - SCORE_DEDUCTIONS.critical - SCORE_DEDUCTIONS.high - SCORE_DEDUCTIONS.medium - SCORE_DEDUCTIONS.low);
    expect(b.countedRisks).toBe(4);
    expect(computeCompliance(Array.from({ length: 10 }, () => r("critical"))).score).toBe(0);
  });

  it("skips closed risks and risks whose quotes were not found, but counts missing clauses", () => {
    const b = computeCompliance([
      { severity: "high", status: "closed", evidenceStatus: "verified" },
      { severity: "high", status: "open", evidenceStatus: "unverified" },
      { severity: "high", status: "mitigating", evidenceStatus: "no_evidence" },
    ]);
    expect(b).toMatchObject({ score: 100 - SCORE_DEDUCTIONS.high, countedRisks: 1, excludedClosed: 1, excludedUnverified: 1 });
  });
});

describe("AI output parsing for the new fields", () => {
  it("accepts older responses without the new fields", () => {
    const old = aiRisk();
    for (const k of ["playbookRuleQuote", "playbookGap", "regulations", "suggestedClause", "suggestedClauseTarget"]) delete (old as Record<string, unknown>)[k];
    const [risk] = parseAnalysisOutput(JSON.stringify({ risks: [old] }));
    expect(risk!.playbookRuleQuote ?? null).toBeNull();
    expect(risk!.suggestedClause ?? null).toBeNull();
    expect(risk!.regulations).toEqual([]);
  });

  it("drops an unknown standard instead of failing the whole response", () => {
    const [risk] = parseAnalysisOutput(JSON.stringify({ risks: [aiRisk({ regulations: [{ framework: "PCI DSS", reference: "Req 3" }] })] }));
    expect(risk!.regulations).toEqual([]);
  });

  it("merges standards from overlapping sections without repeats and keeps the first rule", () => {
    const a = parseAnalysisOutput(JSON.stringify({ risks: [aiRisk({ regulations: [{ framework: "GDPR", reference: "Art. 28 processors" }] })] }));
    const b = parseAnalysisOutput(
      JSON.stringify({
        risks: [
          aiRisk({
            playbookRuleQuote: "Every supplier contract must include a data protection clause.",
            regulations: [
              { framework: "GDPR", reference: "art. 28  processors" },
              { framework: "ISO 27001", reference: "A.5.19 supplier relationships" },
            ],
          }),
        ],
      }),
    );
    const [merged] = mergeRisks([a, b]);
    expect(merged!.regulations.map((r) => r.framework)).toEqual(["GDPR", "ISO 27001"]);
    expect(merged!.playbookRuleQuote).toBe("Payment terms must not exceed 30 days from invoice.");
  });
});

describe("company rules (playbook)", () => {
  it("starts empty, accepts an upload, and replaces it on the next upload", async () => {
    await db.delete(playbooksTable);
    expect((await request(app).get("/api/playbook")).body).toEqual({ playbook: null });

    const first = await request(app).post("/api/playbook").attach("file", Buffer.from("Old rules. Pay within 60 days."), "old-rules.txt");
    expect(first.status).toBe(201);
    const second = await request(app).post("/api/playbook").field("title", "Purchasing rules").attach("file", Buffer.from(RULES), "rules.txt");
    expect(second.status).toBe(201);
    expect(second.body).toMatchObject({ title: "Purchasing rules", sourceType: "text", filename: "rules.txt", charCount: RULES.length });

    const current = await request(app).get("/api/playbook");
    expect(current.body.playbook.id).toBe(second.body.id);
    expect(current.body.playbook.content).toBe(RULES);
    expect(await db.select().from(playbooksTable)).toHaveLength(1);
  });

  it("rejects a rules document that is too long to send with every check", async () => {
    const res = await request(app).post("/api/playbook").attach("file", Buffer.from("Rule. ".repeat(MAX_PLAYBOOK_CHARS / 5)), "huge.txt");
    expect(res.status).toBe(413);
    expect((await request(app).get("/api/playbook")).body.playbook.title).toBe("Purchasing rules");
  });

  it("rejects unsupported files and a missing file", async () => {
    expect((await request(app).post("/api/playbook").attach("file", Buffer.from("MZ"), "rules.exe")).status).toBe(415);
    expect((await request(app).post("/api/playbook").field("title", "x")).status).toBe(400);
  });

  it("sends the rules to the AI, verifies the cited rule, and saves standards and the draft clause", async () => {
    const id = await createDoc(`SUPPLY AGREEMENT ${Date.now()}\n4. Payment. Invoices are payable within 90 days.\n5. The supplier processes customer data.`);
    mockLlm.mockResolvedValue(
      JSON.stringify({
        risks: [
          aiRisk({ regulations: [{ framework: "GDPR", reference: "Art. 28 processor contracts" }] }),
          aiRisk({
            title: "Data protection terms not stated for supplier processing",
            description: "The supplier processes customer data but no data protection clause is included.",
            category: "Security & Privacy",
            riskKind: "missing_protection",
            evidenceQuotes: ["The supplier processes customer data."],
            playbookRuleQuote: "All suppliers must be ISO certified.",
            playbookGap: "No certification clause.",
            regulations: [{ framework: "ISO 27001", reference: "A.5.19 supplier relationships" }],
          }),
        ],
      }),
    );
    const res = await request(app).post(`/api/documents/${id}/analyze`).send({});
    expect(res.status).toBe(202);
    const doc = await waitForAnalysis(id);
    expect(doc.status).toBe("analyzed");
    expect(doc.analysisRuns[0].playbookTitle).toBe("Purchasing rules");

    const prompt = mockLlm.mock.calls[0]![0].user;
    expect(prompt).toContain("<company_rules>");
    expect(prompt).toContain("Payment terms must not exceed 30 days from invoice.");

    const risks = (await request(app).get(`/api/risks?documentId=${id}`)).body as Record<string, any>[];
    const payment = risks.find((r) => r.title.startsWith("Payment term"))!;
    expect(payment).toMatchObject({
      playbookTitle: "Purchasing rules",
      playbookRuleQuote: "Payment terms must not exceed 30 days from invoice.",
      playbookRuleVerified: true,
      playbookGap: "The contract allows 90 days; the rule allows at most 30.",
      regulations: [{ framework: "GDPR", reference: "Art. 28 processor contracts" }],
      suggestedClauseTarget: "Clause 4 (Payment)",
    });
    expect(payment.suggestedClause).toMatch(/thirty \(30\) days/);

    // A rule the AI quotes that is not in the rules document is kept but flagged.
    const invented = risks.find((r) => r.title.startsWith("Data protection"))!;
    expect(invented.playbookRuleVerified).toBe(false);
    expect(invented.reviewRequired).toBe(true);
    expect(invented.reviewReasons.join(" ")).toMatch(/company rule .* could not be found/);

    // The score in the list and the breakdown in the detail come from the same rules.
    const expected = computeCompliance(risks as never);
    expect(doc.compliance.score).toBe(expected.score);
    expect(doc.complianceScore).toBe(expected.score);
    const listed = (await request(app).get("/api/documents")).body.find((d: { id: number }) => d.id === id);
    expect(listed.complianceScore).toBe(expected.score);

    const pdf = await request(app).get(`/api/documents/${id}/report.pdf`).buffer(true);
    expect(pdf.status).toBe(200);
  });

  it("drops the draft clause for a Low finding", async () => {
    const id = await createDoc(`MINOR NOTE ${Date.now()}\nThe office plant is watered weekly by one person.`);
    mockLlm.mockResolvedValue(
      JSON.stringify({
        risks: [aiRisk({ title: "Single person waters plants", severity: "low", riskKind: "potential_risk", evidenceQuotes: ["The office plant is watered weekly by one person."], playbookRuleQuote: null, playbookGap: null })],
      }),
    );
    await request(app).post(`/api/documents/${id}/analyze`).send({});
    await waitForAnalysis(id);
    const [risk] = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    expect(risk).toMatchObject({ severity: "low", suggestedClause: null, suggestedClauseTarget: null, playbookRuleQuote: null });
  });

  it("removes the rules; later checks save no company-rule fields", async () => {
    expect((await request(app).delete("/api/playbook")).status).toBe(204);
    expect((await request(app).delete("/api/playbook")).status).toBe(404);
    expect((await request(app).get("/api/playbook")).body).toEqual({ playbook: null });

    const id = await createDoc(`SUPPLY AGREEMENT B ${Date.now()}\n4. Payment. Invoices are payable within 90 days.`);
    mockLlm.mockResolvedValue(JSON.stringify({ risks: [aiRisk()] }));
    await request(app).post(`/api/documents/${id}/analyze`).send({});
    const doc = await waitForAnalysis(id);
    expect(doc.analysisRuns[0].playbookTitle).toBeNull();
    expect(mockLlm.mock.calls[0]![0].user).not.toContain("<company_rules>");
    const [risk] = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    expect(risk).toMatchObject({ playbookRuleQuote: null, playbookRuleVerified: null, playbookGap: null, playbookTitle: null });
  });

  it("gives no score to a document that was never checked", async () => {
    const id = await createDoc(`UNCHECKED ${Date.now()}\nNothing here yet.`);
    const doc = (await request(app).get(`/api/documents/${id}`)).body;
    expect(doc).toMatchObject({ complianceScore: null, compliance: null });
  });
});
