import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  assessmentsTable,
  reassessmentRequestsTable,
  riskStatusChangesTable,
} from "@workspace/db";
import {
  ChangeRiskStatusBody,
  ChangeRiskStatusParams,
  ChangeRiskStatusResponse,
  DecideAssessmentBody,
  DecideAssessmentParams,
  DecideAssessmentResponse,
  RequestReassessmentParams,
  RequestReassessmentResponse,
} from "@workspace/api-zod";
import { receiveFile, uploadedFilename } from "../lib/upload";
import { ExtractionError, assertTextWithinLimits, extractFromUpload } from "../lib/text-extraction";
import { startReassessment, type EvidenceSource } from "../lib/reassessment-runner";

const router: IRouter = Router();

/** Minimum justification length when closing a risk. */
export const MIN_CLOSURE_NOTE = 10;

function optionalInt(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : "invalid";
}

router.post("/risks/:id/reassessments", receiveFile, async (req, res) => {
  const params = RequestReassessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid risk id" });
    return;
  }
  // Multipart fields arrive as strings; parse them explicitly.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const content = typeof body["content"] === "string" ? body["content"] : "";
  const rawTitle = typeof body["title"] === "string" ? body["title"].trim() : "";
  const documentId = optionalInt(body["documentId"]);
  const actionId = optionalInt(body["actionId"]);
  if (documentId === "invalid" || actionId === "invalid") {
    res.status(400).json({ error: "documentId and actionId must be positive integers." });
    return;
  }
  if (rawTitle.length > 200) {
    res.status(400).json({ error: "Title must be 200 characters or fewer." });
    return;
  }
  const provided = [req.file !== undefined, content.trim() !== "", documentId !== null].filter(Boolean).length;
  if (provided !== 1) {
    res.status(400).json({
      error: "Provide exactly one kind of evidence: a file, pasted text, or an existing document.",
    });
    return;
  }

  let source: EvidenceSource;
  try {
    if (req.file) {
      const filename = uploadedFilename(req.file);
      const extracted = await extractFromUpload(req.file.buffer, filename);
      source = {
        kind: "new",
        title: (rawTitle || filename.replace(/\.[^.]+$/, "") || filename).slice(0, 200),
        filename,
        fileSize: req.file.size,
        extracted,
      };
    } else if (documentId !== null) {
      source = { kind: "existing", documentId };
    } else {
      const text = content.replace(/\r\n?/g, "\n");
      assertTextWithinLimits(text);
      source = {
        kind: "new",
        title: rawTitle || "Follow-up evidence",
        filename: null,
        fileSize: null,
        extracted: { text, sourceType: "text", pageOffsets: null },
      };
    }
  } catch (err) {
    if (err instanceof ExtractionError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  const result = await startReassessment(params.data.id, actionId, source, req.log);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const [row] = await db
    .select()
    .from(reassessmentRequestsTable)
    .where(eq(reassessmentRequestsTable.id, result.requestId));
  const [doc] = await db
    .select({ title: documentsTable.title })
    .from(documentsTable)
    .where(eq(documentsTable.id, row!.evidenceDocumentId));
  res.status(202).json(RequestReassessmentResponse.parse({ ...row, evidenceDocumentTitle: doc?.title ?? "" }));
});

router.post("/assessments/:id/decision", async (req, res) => {
  const params = DecideAssessmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid assessment id" });
    return;
  }
  const body = DecideAssessmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const decidedBy = body.data.decidedBy.trim();
  if (decidedBy.length < 2) {
    res.status(400).json({ error: "Enter the name of the person making the decision." });
    return;
  }
  const [existing] = await db.select().from(assessmentsTable).where(eq(assessmentsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Assessment not found" });
    return;
  }
  if (existing.kind !== "reassessment") {
    res.status(409).json({ error: "Only reassessment recommendations can be accepted or rejected." });
    return;
  }
  // Conditional update: a decision is recorded once and never overwritten.
  const [row] = await db
    .update(assessmentsTable)
    .set({
      decision: body.data.decision,
      decidedBy,
      decisionNote: body.data.note?.trim() || null,
      decidedAt: new Date(),
    })
    .where(and(eq(assessmentsTable.id, existing.id), isNull(assessmentsTable.decision)))
    .returning();
  if (!row) {
    res.status(409).json({ error: "A decision has already been recorded for this reassessment." });
    return;
  }
  req.log.info({ assessmentId: row.id, decision: row.decision }, "Reassessment decision recorded");

  const evidence = await db
    .select({
      id: evidenceTable.id,
      riskId: evidenceTable.riskId,
      documentId: evidenceTable.documentId,
      documentTitle: documentsTable.title,
      assessmentId: evidenceTable.assessmentId,
      quote: evidenceTable.quote,
      claimedQuote: evidenceTable.claimedQuote,
      matchType: evidenceTable.matchType,
      normalizations: evidenceTable.normalizations,
      matchCount: evidenceTable.matchCount,
      startOffset: evidenceTable.startOffset,
      endOffset: evidenceTable.endOffset,
      verified: evidenceTable.verified,
      pageNumber: evidenceTable.pageNumber,
      createdAt: evidenceTable.createdAt,
    })
    .from(evidenceTable)
    .innerJoin(documentsTable, eq(documentsTable.id, evidenceTable.documentId))
    .where(eq(evidenceTable.assessmentId, row.id))
    .orderBy(evidenceTable.id);
  const [doc] = row.evidenceDocumentId
    ? await db.select({ title: documentsTable.title }).from(documentsTable).where(eq(documentsTable.id, row.evidenceDocumentId))
    : [];
  res.json(DecideAssessmentResponse.parse({ ...row, evidence, evidenceDocumentTitle: doc?.title ?? null }));
});

router.post("/risks/:id/status", async (req, res) => {
  const params = ChangeRiskStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid risk id" });
    return;
  }
  const body = ChangeRiskStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { status, assessmentId = null, approveClosure = false } = body.data;
  const changedBy = body.data.changedBy.trim();
  const note = body.data.note?.trim() || null;
  if (changedBy.length < 2) {
    res.status(400).json({ error: "Enter the name of the person making the change." });
    return;
  }
  if (status === "closed") {
    if (approveClosure !== true) {
      res.status(400).json({ error: "Closing a risk requires explicit human approval (approveClosure: true)." });
      return;
    }
    if (!note || note.length < MIN_CLOSURE_NOTE) {
      res.status(400).json({
        error: `Closing a risk requires a justification of at least ${MIN_CLOSURE_NOTE} characters.`,
      });
      return;
    }
  }

  const [risk] = await db
    .select({ id: risksTable.id, status: risksTable.status })
    .from(risksTable)
    .where(eq(risksTable.id, params.data.id));
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  if (risk.status === status) {
    res.status(409).json({ error: `The risk is already ${status}.` });
    return;
  }
  if (assessmentId !== null) {
    const [a] = await db
      .select({ riskId: assessmentsTable.riskId, kind: assessmentsTable.kind })
      .from(assessmentsTable)
      .where(eq(assessmentsTable.id, assessmentId));
    if (!a || a.riskId !== risk.id || a.kind !== "reassessment") {
      res.status(404).json({ error: "That reassessment does not belong to this risk." });
      return;
    }
  }

  // The previous status is kept in the change record; the update only applies if
  // the status has not changed in the meantime.
  const change = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(risksTable)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(risksTable.id, risk.id), eq(risksTable.status, risk.status)))
      .returning({ id: risksTable.id });
    if (!updated) return null;
    const [row] = await tx
      .insert(riskStatusChangesTable)
      .values({ riskId: risk.id, fromStatus: risk.status, toStatus: status, changedBy, note, assessmentId })
      .returning();
    return row!;
  });
  if (!change) {
    res.status(409).json({ error: "The risk's status was changed by someone else. Reload and try again." });
    return;
  }
  req.log.info({ riskId: risk.id, from: change.fromStatus, to: change.toStatus, assessmentId }, "Risk status changed");
  res.json(ChangeRiskStatusResponse.parse(change));
});

export default router;
