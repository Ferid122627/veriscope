// GET /risks/:id reads several sections. They must all come from one snapshot, so a
// reassessment that commits while the request is running can never be seen half-way
// (a completed request without its assessment or evidence).
//
// The interleaving is forced, not left to timing: a second connection holds a lock
// on reassessment_requests, the endpoint is started and blocks on that table
// (after it has already read the assessments), the "reassessment" is committed on
// the second connection, and only then is the endpoint allowed to continue.
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool, documentsTable, risksTable, reassessmentRequestsTable } from "@workspace/db";

const { default: app } = await import("../src/app");

const createdDocs: number[] = [];
afterAll(async () => {
  if (createdDocs.length) await db.delete(documentsTable).where(inArray(documentsTable.id, createdDocs));
});

async function insertDoc(title: string): Promise<number> {
  const content = `Read consistency fixture ${randomUUID()}. The site has no backup generator.`;
  const [doc] = await db
    .insert(documentsTable)
    .values({ title, content, charCount: content.length, contentHash: randomUUID() })
    .returning({ id: documentsTable.id });
  createdDocs.push(doc!.id);
  return doc!.id;
}

async function waitUntilBlockedOnRequestsTable(): Promise<void> {
  for (let i = 0; i < 500; i++) {
    const { rows } = await pool.query(
      `select 1 from pg_stat_activity
       where datname = current_database() and pid <> pg_backend_pid()
         and wait_event_type = 'Lock' and query ilike '%reassessment_requests%'`,
    );
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("the endpoint never blocked on reassessment_requests");
}

describe("GET /risks/:id read consistency", () => {
  it("never shows a completed reassessment request without its committed assessment and evidence", async () => {
    const sourceId = await insertDoc("consistency source");
    const evidenceDocId = await insertDoc("consistency evidence");
    const [risk] = await db
      .insert(risksTable)
      .values({
        documentId: sourceId,
        title: "Consistency fixture risk",
        description: "Fixture risk used to test read consistency.",
        category: "Operational",
        severity: "high",
      })
      .returning({ id: risksTable.id });
    const riskId = risk!.id;
    const [req] = await db
      .insert(reassessmentRequestsTable)
      .values({ riskId, evidenceDocumentId: evidenceDocId, status: "pending", model: "test" })
      .returning({ id: reassessmentRequestsTable.id });

    const writer = await pool.connect();
    let released = false;
    try {
      // The "reassessment" transaction: holds the lock the endpoint will need.
      await writer.query("BEGIN");
      await writer.query("LOCK TABLE reassessment_requests IN ACCESS EXCLUSIVE MODE");

      const response = new Promise<request.Response>((resolve, reject) =>
        request(app)
          .get(`/api/risks/${riskId}`)
          .end((err, res) => (err ? reject(err) : resolve(res))),
      );
      await waitUntilBlockedOnRequestsTable();

      // Commit the reassessment result while the endpoint is part-way through its reads.
      const { rows } = await writer.query(
        `insert into assessments (risk_id, kind, verdict, rationale, evidence_document_id)
         values ($1, 'reassessment', 'needs_human_review', 'fixture', $2) returning id`,
        [riskId, evidenceDocId],
      );
      const assessmentId = rows[0].id as number;
      await writer.query(
        `insert into evidence (risk_id, document_id, assessment_id, quote, verified)
         values ($1, $2, $3, 'The site has no backup generator.', true)`,
        [riskId, evidenceDocId, assessmentId],
      );
      await writer.query(
        `update reassessment_requests set status = 'completed', assessment_id = $2, finished_at = now() where id = $1`,
        [req!.id, assessmentId],
      );
      await writer.query("COMMIT");
      released = true;

      const body = (await response).body;
      expect((await response).status).toBe(200);
      // Whatever the snapshot, the sections must agree with each other.
      for (const r of body.reassessmentRequests as { status: string; assessmentId: number | null }[]) {
        if (r.status === "completed") {
          const a = body.assessments.find((x: { id: number }) => x.id === r.assessmentId);
          expect(a, "completed request without its assessment").toBeDefined();
          expect(a.evidence.length, "completed request without its evidence").toBeGreaterThan(0);
        }
      }
      // The snapshot began before the commit, so the whole reassessment is absent.
      expect(body.reassessmentRequests[0]).toMatchObject({ id: req!.id, status: "pending", assessmentId: null });
      expect(body.assessments).toHaveLength(0);

      // A request made after the commit sees all of it.
      const after = (await request(app).get(`/api/risks/${riskId}`)).body;
      expect(after.reassessmentRequests[0]).toMatchObject({ status: "completed", assessmentId });
      expect(after.assessments).toHaveLength(1);
      expect(after.assessments[0].evidence).toHaveLength(1);
    } finally {
      if (!released) await writer.query("ROLLBACK").catch(() => undefined);
      writer.release();
    }
    await db.delete(risksTable).where(eq(risksTable.id, riskId));
  });

  it("still returns 404 for a missing risk and 400 for an invalid id", async () => {
    expect((await request(app).get("/api/risks/999999999")).status).toBe(404);
    expect((await request(app).get("/api/risks/abc")).status).toBe(400);
  });
});
