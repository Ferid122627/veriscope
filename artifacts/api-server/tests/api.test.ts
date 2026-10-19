// Integration tests: exercise the real Express app against the development
// Postgres database. Every row created here is removed in afterAll.
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
} from "@workspace/db";
import app from "../src/app";

const createdDocumentIds: number[] = [];

afterAll(async () => {
  if (createdDocumentIds.length) {
    // Cascades to risks, evidence, actions and assessments.
    await db.delete(documentsTable).where(inArray(documentsTable.id, createdDocumentIds));
  }
});

describe("health", () => {
  it("GET /api/healthz returns ok", async () => {
    const res = await request(app).get("/api/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("GET /api/system/status probes the real database", async () => {
    const res = await request(app).get("/api/system/status");
    expect(res.status).toBe(200);
    expect(res.body.api).toBe("ok");
    expect(res.body.database).toBe("ok");
    expect(["configured", "not_configured"]).toContain(res.body.aiProvider);
  });
});

describe("documents", () => {
  it("rejects an empty title and whitespace-only content", async () => {
    const noTitle = await request(app).post("/api/documents").send({ title: "", content: "x" });
    expect(noTitle.status).toBe(400);
    expect(typeof noTitle.body.error).toBe("string");

    const blank = await request(app).post("/api/documents").send({ title: "T", content: "   \n " });
    expect(blank.status).toBe(400);
  });

  it("creates, reads, lists and deletes a document, preserving exact text", async () => {
    const content = "Clause 4.2: Supplier may terminate with 7 days notice.\n  Indented line.";
    const created = await request(app)
      .post("/api/documents")
      .send({ title: "  Test supplier contract  ", content, filename: "contract.txt" });
    expect(created.status).toBe(201);
    createdDocumentIds.push(created.body.id);
    expect(created.body).toMatchObject({
      title: "Test supplier contract",
      filename: "contract.txt",
      charCount: content.length,
      status: "uploaded",
      riskCount: 0,
      content,
    });

    const fetched = await request(app).get(`/api/documents/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.content).toBe(content);

    const list = await request(app).get("/api/documents");
    expect(list.status).toBe(200);
    expect(list.body.map((d: { id: number }) => d.id)).toContain(created.body.id);
    expect(list.body[0]).not.toHaveProperty("content");

    const del = await request(app).delete(`/api/documents/${created.body.id}`);
    expect(del.status).toBe(204);
    const gone = await request(app).get(`/api/documents/${created.body.id}`);
    expect(gone.status).toBe(404);
  });

  it("returns 400 for a non-numeric id and 404 for a missing one", async () => {
    expect((await request(app).get("/api/documents/abc")).status).toBe(400);
    expect((await request(app).get("/api/documents/999999999")).status).toBe(404);
    expect((await request(app).delete("/api/documents/999999999")).status).toBe(404);
  });
});

describe("risks", () => {
  it("returns risk detail with evidence, actions and assessment history", async () => {
    const content = "The vendor has no SOC 2 report. Data is stored outside the EU.";
    const [doc] = await db
      .insert(documentsTable)
      .values({ title: "Test vendor review", content, charCount: content.length })
      .returning();
    createdDocumentIds.push(doc!.id);

    const [risk] = await db
      .insert(risksTable)
      .values({
        documentId: doc!.id,
        title: "Missing security attestation",
        description: "Vendor lacks independent security assurance.",
        category: "Third-party",
        severity: "high",
      })
      .returning();
    const quote = "The vendor has no SOC 2 report.";
    await db.insert(evidenceTable).values({
      riskId: risk!.id,
      documentId: doc!.id,
      quote,
      startOffset: 0,
      endOffset: quote.length,
      verified: true,
    });
    await db.insert(mitigationActionsTable).values([
      { riskId: risk!.id, description: "Request SOC 2 Type II", dueDate: "2026-11-30" },
      { riskId: risk!.id, description: "Add audit clause", status: "done" },
    ]);
    await db.insert(assessmentsTable).values({
      riskId: risk!.id,
      kind: "initial",
      verdict: "identified",
      rationale: "Stated directly in the review.",
      confidence: 0.9,
    });

    const res = await request(app).get(`/api/risks/${risk!.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: risk!.id,
      documentTitle: "Test vendor review",
      severity: "high",
      status: "open",
      evidenceCount: 1,
      openActionCount: 1,
    });
    expect(res.body.evidence[0]).toMatchObject({ quote, verified: true, startOffset: 0 });
    expect(content.slice(res.body.evidence[0].startOffset, res.body.evidence[0].endOffset)).toBe(quote);
    expect(res.body.actions).toHaveLength(2);
    expect(res.body.actions[0].dueDate).toBe("2026-11-30");
    expect(res.body.assessments[0].verdict).toBe("identified");

    const filtered = await request(app).get(`/api/risks?documentId=${doc!.id}&severity=high`);
    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    const none = await request(app).get(`/api/risks?documentId=${doc!.id}&severity=low`);
    expect(none.body).toHaveLength(0);

    const summary = await request(app).get("/api/dashboard/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.totalRisks).toBeGreaterThanOrEqual(1);
    expect(summary.body.verifiedEvidence).toBeGreaterThanOrEqual(1);

    const activity = await request(app).get("/api/dashboard/activity");
    expect(activity.status).toBe(200);
    expect(activity.body.map((a: { id: string }) => a.id)).toContain(`risk-${risk!.id}`);

    // Deleting the document removes everything derived from it.
    await db.delete(documentsTable).where(eq(documentsTable.id, doc!.id));
    expect((await request(app).get(`/api/risks/${risk!.id}`)).status).toBe(404);
  });

  it("rejects invalid filters", async () => {
    const res = await request(app).get("/api/risks?severity=extreme");
    expect(res.status).toBe(400);
  });
});
