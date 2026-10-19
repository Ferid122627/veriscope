// Phase 2: upload/extraction and AI analysis. The LLM call is mocked here so
// each failure mode can be forced deterministically; the real provider is
// exercised separately (see replit.md "Verifying with the real provider").
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import { db, documentsTable, risksTable } from "@workspace/db";

vi.mock("../src/lib/ai/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/ai/client")>();
  return { ...actual, requestStructuredCompletion: vi.fn() };
});

const { requestStructuredCompletion } = await import("../src/lib/ai/client");
const { default: app } = await import("../src/app");
const mockLlm = vi.mocked(requestStructuredCompletion);

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = (name: string) => path.join(fixtures, name);

const createdIds: number[] = [];
afterAll(async () => {
  if (createdIds.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdIds));
});

async function createTextDoc(content: string): Promise<number> {
  const res = await request(app).post("/api/documents").send({ title: "Analysis test", content });
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
    title: "Single point of failure in approvals",
    description: "Refunds are approved by one person with no second review.",
    category: "Operational",
    severity: "high",
    likelihood: "medium",
    businessImpact: "Fraudulent or mistaken refunds could go undetected.",
    recommendedMitigation: "Require dual approval for refunds above a threshold.",
    evidenceQuotes: ["Customer refunds are approved by one person without review."],
    evidenceBasis: "direct",
    interpretationNote: null,
    rationale: "The text states a single approver with no review.",
    confidence: 0.9,
    needsHumanReview: false,
    reviewNotes: null,
    matchesExistingRiskId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockLlm.mockReset();
});

describe("upload and text extraction", () => {
  it("extracts text and page boundaries from a valid PDF", async () => {
    const res = await request(app).post("/api/documents/upload").attach("file", fixture("fixture-two-page.pdf"));
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body).toMatchObject({ sourceType: "pdf", pageCount: 2, status: "uploaded", title: "fixture-two-page" });
    expect(res.body.content).toContain("The warehouse has a single fire exit.");
    expect(res.body.pageOffsets).toHaveLength(2);
    const page2 = res.body.content.slice(res.body.pageOffsets[1]);
    expect(page2).toContain("Customer refunds are approved by one person without review.");
  });

  it("extracts text from a DOCX and uses the provided title", async () => {
    const res = await request(app)
      .post("/api/documents/upload")
      .field("title", "Billing memo")
      .attach("file", fixture("fixture-memo.docx"));
    expect(res.status).toBe(201);
    createdIds.push(res.body.id);
    expect(res.body).toMatchObject({ sourceType: "docx", title: "Billing memo", pageCount: null });
    expect(res.body.content).toContain("Backups of the billing system have never been restored in a test.");
  });

  it("rejects a duplicate upload and points to the existing document", async () => {
    const res = await request(app).post("/api/documents/upload").attach("file", fixture("fixture-memo.docx"));
    expect(res.status).toBe(409);
    expect(createdIds).toContain(res.body.existingDocumentId);
  });

  it("rejects unsupported file types", async () => {
    const res = await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("MZ binary"), "tool.exe");
    expect(res.status).toBe(415);
    expect(res.body.error).toMatch(/Unsupported file type/);
  });

  it("rejects a file whose content does not match its extension", async () => {
    const res = await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("not a zip"), "report.docx");
    expect(res.status).toBe(422);
  });

  it("rejects an empty file", async () => {
    const res = await request(app).post("/api/documents/upload").attach("file", fixture("empty.txt"));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/empty/i);
  });

  it("rejects a corrupted PDF", async () => {
    const res = await request(app).post("/api/documents/upload").attach("file", fixture("corrupted.pdf"));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/could not be read/);
  });

  it("explains that a scanned (image-only) PDF cannot be read without OCR", async () => {
    const res = await request(app).post("/api/documents/upload").attach("file", fixture("scanned.pdf"));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/does not perform OCR/);
  });

  it("requires a file", async () => {
    const res = await request(app).post("/api/documents/upload").field("title", "nothing");
    expect(res.status).toBe(400);
  });
});

describe("AI analysis", () => {
  it("returns 503 and leaves the document untouched when AI credentials are missing", async () => {
    const id = await createTextDoc("Credentials test document. The vendor has no insurance.");
    const saved = {
      url: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
      key: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
    };
    delete process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
    delete process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
    try {
      const res = await request(app).post(`/api/documents/${id}/analyze`).send({});
      expect(res.status).toBe(503);
      expect(res.body.error).toMatch(/not configured/);
      const status = await request(app).get("/api/system/status");
      expect(status.body.aiProvider).toBe("not_configured");
    } finally {
      if (saved.url) process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] = saved.url;
      if (saved.key) process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] = saved.key;
    }
    expect(mockLlm).not.toHaveBeenCalled();
    const doc = await request(app).get(`/api/documents/${id}`);
    expect(doc.body.status).toBe("uploaded");
  });

  it("saves validated risks, verifies quotes against the source, and records page numbers", async () => {
    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ??= "http://unused.test";
    process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] ??= "unused";
    const upload = await request(app)
      .post("/api/documents/upload")
      .attach("file", Buffer.from("VERISCOPE ANALYSIS FIXTURE.\nCustomer refunds are approved by one person   without review."), "refunds.txt");
    expect(upload.status).toBe(201);
    const id = upload.body.id;
    createdIds.push(id);

    mockLlm.mockResolvedValue(
      JSON.stringify({
        risks: [
          aiRisk({
            evidenceQuotes: [
              // whitespace differs from the source: should still verify
              "Customer refunds are approved by one person without review.",
              // not in the document: must be stored as unverified
              "Refunds over EUR 1m are never audited.",
            ],
          }),
        ],
      }),
    );

    const start = await request(app).post(`/api/documents/${id}/analyze`).send({});
    expect(start.status).toBe(202);
    expect(start.body.status).toBe("analyzing");

    // The model only ever receives the document inside the untrusted-data block.
    const prompt = mockLlm.mock.calls[0]![0];
    expect(prompt.system).toMatch(/untrusted data/);
    expect(prompt.user).toMatch(/<document>[\s\S]*Customer refunds[\s\S]*<\/document>/);

    const doc = await waitForAnalysis(id);
    expect(doc).toMatchObject({ status: "analyzed", analysisError: null, riskCount: 1, chunksDone: 1, chunksTotal: 1 });

    const [risk] = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    const detail = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(detail).toMatchObject({ severity: "high", likelihood: "medium", category: "Operational", status: "open" });
    expect(detail.businessImpact).toMatch(/undetected/);

    const verified = detail.evidence.find((e: { verified: boolean }) => e.verified);
    const unverified = detail.evidence.find((e: { verified: boolean }) => !e.verified);
    expect(upload.body.content.slice(verified.startOffset, verified.endOffset)).toBe(verified.quote);
    expect(verified.quote).toBe("Customer refunds are approved by one person   without review.");
    expect(unverified).toMatchObject({ startOffset: null, endOffset: null, pageNumber: null });

    expect(detail.actions).toHaveLength(1);
    expect(detail.actions[0]).toMatchObject({ status: "todo", description: expect.stringMatching(/dual approval/) });
    expect(detail.assessments).toHaveLength(1);
    expect(detail.assessments[0]).toMatchObject({ kind: "initial", verdict: "identified", confidence: 0.9 });

    // Repeat submission without explicit replace is refused.
    const again = await request(app).post(`/api/documents/${id}/analyze`).send({});
    expect(again.status).toBe(409);

    // A failed re-run keeps the previous results.
    mockLlm.mockResolvedValue("{not json");
    expect((await request(app).post(`/api/documents/${id}/analyze`).send({ rerun: true })).status).toBe(202);
    const failed = await waitForAnalysis(id);
    expect(failed.status).toBe("failed");
    expect(failed.riskCount).toBe(1);

    expect(failed.analysisRuns.map((r: { status: string }) => r.status)).toEqual(["failed", "completed"]);
    const afterFailure = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(afterFailure.assessments).toHaveLength(1);
  });

  it("records page numbers for PDF evidence", async () => {
    const upload = await request(app)
      .post("/api/documents/upload")
      .attach("file", fixture("fixture-two-page.pdf"), "fixture-two-page-copy.pdf");
    // The same PDF was uploaded earlier in this file; reuse it.
    const id = upload.status === 201 ? upload.body.id : upload.body.existingDocumentId;
    if (upload.status === 201) createdIds.push(id);
    await db.update(documentsTable).set({ status: "uploaded" }).where(eq(documentsTable.id, id));

    mockLlm.mockResolvedValue(JSON.stringify({ risks: [aiRisk()] }));
    expect((await request(app).post(`/api/documents/${id}/analyze`).send({ rerun: true })).status).toBe(202);
    await waitForAnalysis(id);
    const [risk] = (await request(app).get(`/api/risks?documentId=${id}`)).body;
    const detail = (await request(app).get(`/api/risks/${risk.id}`)).body;
    expect(detail.evidence[0]).toMatchObject({ verified: true, pageNumber: 2 });
  });

  it("marks the analysis failed and saves nothing when the AI returns malformed JSON", async () => {
    const id = await createTextDoc("Malformed output test. Payroll is processed by an unsupported legacy system.");
    mockLlm.mockResolvedValue("Sure! Here are the risks: ...");
    expect((await request(app).post(`/api/documents/${id}/analyze`).send({})).status).toBe(202);
    const doc = await waitForAnalysis(id);
    expect(doc.status).toBe("failed");
    expect(doc.analysisError).toMatch(/not valid JSON/);
    expect(doc.riskCount).toBe(0);
    expect(mockLlm).toHaveBeenCalledTimes(2); // one retry for malformed output
  });

  it("rejects output that is valid JSON but violates the schema", async () => {
    const id = await createTextDoc("Schema test. The office lease expires next month with no renewal.");
    mockLlm.mockResolvedValue(JSON.stringify({ risks: [aiRisk({ severity: "catastrophic", evidenceQuotes: [] })] }));
    await request(app).post(`/api/documents/${id}/analyze`).send({});
    const doc = await waitForAnalysis(id);
    expect(doc.status).toBe("failed");
    expect(doc.analysisError).toMatch(/did not match the expected format/);
    const risks = await db.select().from(risksTable).where(eq(risksTable.documentId, id));
    expect(risks).toHaveLength(0);
  });

  it("surfaces a provider failure as a clear error", async () => {
    const id = await createTextDoc("Provider failure test. The CFO role has been vacant for six months.");
    mockLlm.mockRejectedValue(Object.assign(new Error("Bad request"), { status: 400 }));
    await request(app).post(`/api/documents/${id}/analyze`).send({});
    const doc = await waitForAnalysis(id);
    expect(doc.status).toBe("failed");
    expect(doc.analysisError).toMatch(/HTTP 400/);
  });

  it("returns 404 for analysis of a missing document", async () => {
    expect((await request(app).post("/api/documents/999999999/analyze").send({})).status).toBe(404);
  });
});
