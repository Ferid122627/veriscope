// PDF report endpoint: real app + database, no AI calls. Rows created here are removed in afterAll.
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { inArray } from "drizzle-orm";
import { db, documentsTable, risksTable, evidenceTable, mitigationActionsTable } from "@workspace/db";
import app from "../src/app";

const created: number[] = [];

afterAll(async () => {
  if (created.length) await db.delete(documentsTable).where(inArray(documentsTable.id, created));
});

const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("GET /api/documents/:id/report.pdf", () => {
  it("returns a PDF attachment for a document with risks, quotes and actions", async () => {
    const content = "The Supplier’s liability is capped at fees paid in the last three months.\nNo deletion deadline is set.";
    const doc = await request(app).post("/api/documents").send({ title: "Report test – ünïcode", content });
    expect(doc.status).toBe(201);
    created.push(doc.body.id);

    const [risk] = await db
      .insert(risksTable)
      .values({
        documentId: doc.body.id,
        title: "Liability cap may not cover data breaches",
        description: "The cap is low.",
        category: "Financial",
        severity: "high",
        evidenceStatus: "partially_verified",
        reviewRequired: true,
        reviewReasons: ["1 of 2 quotations could not be found in the source text."],
        recommendedMitigation: "Negotiate a carve-out.",
      })
      .returning();
    await db.insert(evidenceTable).values([
      { riskId: risk!.id, documentId: doc.body.id, quote: "liability is capped at fees paid in the last three months", verified: true, matchType: "exact", matchCount: 1, startOffset: 15, endOffset: 72 },
      { riskId: risk!.id, documentId: doc.body.id, quote: "A quote the AI invented", verified: false, matchType: "not_found" },
    ]);
    await db.insert(mitigationActionsTable).values({ riskId: risk!.id, description: "Ask legal to review", owner: "Aysel", dueDate: "2026-11-01" });

    const res = await request(app).get(`/api/documents/${doc.body.id}/report.pdf`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="veriscope-report-[\w.-]+\.pdf"$/);
    const body = res.body as Buffer;
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(5000);
  });

  it("works for a document that has not been checked yet", async () => {
    const doc = await request(app).post("/api/documents").send({ title: "Unchecked", content: "Plain text." });
    created.push(doc.body.id);
    const res = await request(app).get(`/api/documents/${doc.body.id}/report.pdf`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns 404 for a missing document and 400 for an invalid id", async () => {
    expect((await request(app).get("/api/documents/99999999/report.pdf")).status).toBe(404);
    expect((await request(app).get("/api/documents/abc/report.pdf")).status).toBe(400);
  });
});
