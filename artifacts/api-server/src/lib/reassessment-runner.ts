import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
  reassessmentRequestsTable,
} from "@workspace/db";
import { ANALYSIS_MODEL, AiNotConfiguredError, isAiConfigured } from "./ai/client";
import { reassessRisk } from "./ai/reassessment";
import { applyReassessmentRules } from "./reassessment-rules";
import { userFacingError, verifyQuotes } from "./analysis-runner";
import { pageForOffset } from "./evidence-locator";
import { insertDocument } from "./document-store";
import type { ExtractedDocument } from "./text-extraction";

/** The whole evidence document is sent in one request, so it must fit comfortably. */
export const MAX_REASSESSMENT_CHARS = 100_000;

export type EvidenceSource =
  | { kind: "existing"; documentId: number }
  | { kind: "new"; title: string; filename: string | null; fileSize: number | null; extracted: ExtractedDocument };

export type StartReassessmentResult =
  | { ok: true; requestId: number }
  | { ok: false; status: 400 | 404 | 409 | 413 | 503; error: string };

const ALREADY_RUNNING = "A reassessment is already running for this risk. Wait for it to finish.";

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

function tooLong(chars: number): string {
  return `The evidence has ${chars.toLocaleString("en-US")} characters; a reassessment accepts at most ${MAX_REASSESSMENT_CHARS.toLocaleString("en-US")}. Submit only the relevant section.`;
}

/**
 * Validate the request, store the evidence document, record a pending request and
 * evaluate it in the background. Nothing here (or in the background run) changes
 * the risk itself: the outcome is only a recommendation.
 */
export async function startReassessment(
  riskId: number,
  actionId: number | null,
  source: EvidenceSource,
  log: Logger,
): Promise<StartReassessmentResult> {
  if (!isAiConfigured()) return { ok: false, status: 503, error: new AiNotConfiguredError().message };

  const [risk] = await db
    .select({ id: risksTable.id, documentId: risksTable.documentId })
    .from(risksTable)
    .where(eq(risksTable.id, riskId));
  if (!risk) return { ok: false, status: 404, error: "Risk not found" };

  const [pending] = await db
    .select({ id: reassessmentRequestsTable.id })
    .from(reassessmentRequestsTable)
    .where(and(eq(reassessmentRequestsTable.riskId, riskId), eq(reassessmentRequestsTable.status, "pending")));
  if (pending) return { ok: false, status: 409, error: ALREADY_RUNNING };

  let resolvedActionId: number | null = null;
  if (actionId !== null) {
    const [action] = await db
      .select({ id: mitigationActionsTable.id })
      .from(mitigationActionsTable)
      .where(and(eq(mitigationActionsTable.id, actionId), eq(mitigationActionsTable.riskId, riskId)));
    if (!action) return { ok: false, status: 404, error: "That mitigation action does not belong to this risk." };
    resolvedActionId = action.id;
  } else {
    const [latest] = await db
      .select({ id: mitigationActionsTable.id })
      .from(mitigationActionsTable)
      .where(eq(mitigationActionsTable.riskId, riskId))
      .orderBy(desc(mitigationActionsTable.updatedAt), desc(mitigationActionsTable.id))
      .limit(1);
    resolvedActionId = latest?.id ?? null;
  }

  let evidenceDocumentId: number;
  if (source.kind === "existing") {
    const [doc] = await db
      .select({ id: documentsTable.id, charCount: documentsTable.charCount })
      .from(documentsTable)
      .where(eq(documentsTable.id, source.documentId));
    if (!doc) return { ok: false, status: 404, error: "Evidence document not found" };
    if (doc.charCount > MAX_REASSESSMENT_CHARS) return { ok: false, status: 413, error: tooLong(doc.charCount) };
    evidenceDocumentId = doc.id;
  } else {
    const chars = source.extracted.text.length;
    if (chars > MAX_REASSESSMENT_CHARS) return { ok: false, status: 413, error: tooLong(chars) };
    const outcome = await insertDocument({
      title: source.title,
      filename: source.filename,
      fileSize: source.fileSize,
      extracted: source.extracted,
      purpose: "evidence",
    });
    // Identical text already stored: reuse that document as the evidence.
    evidenceDocumentId = "created" in outcome ? outcome.created.id : outcome.duplicateOf;
  }
  if (evidenceDocumentId === risk.documentId) {
    return {
      ok: false,
      status: 400,
      error: "This is the document the risk was found in. Reassessment needs new evidence.",
    };
  }

  let requestId: number;
  try {
    const [row] = await db
      .insert(reassessmentRequestsTable)
      .values({ riskId, actionId: resolvedActionId, evidenceDocumentId, model: ANALYSIS_MODEL })
      .returning({ id: reassessmentRequestsTable.id });
    requestId = row!.id;
  } catch (err) {
    // The partial unique index allows only one pending request per risk.
    if (isUniqueViolation(err)) return { ok: false, status: 409, error: ALREADY_RUNNING };
    throw err;
  }

  log.info({ riskId, requestId, evidenceDocumentId, actionId: resolvedActionId }, "Reassessment started");
  void runReassessment(requestId, log);
  return { ok: true, requestId };
}

/** Verified quotations from the risk's current evidence (see routes/risks.ts). */
async function currentVerifiedQuotes(riskId: number): Promise<string[]> {
  const [latest] = await db
    .select({ id: assessmentsTable.id })
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.riskId, riskId), eq(assessmentsTable.verdict, "identified")))
    .orderBy(desc(assessmentsTable.createdAt), desc(assessmentsTable.id))
    .limit(1);
  const rows = await db
    .select({ quote: evidenceTable.quote })
    .from(evidenceTable)
    .where(
      and(
        eq(evidenceTable.riskId, riskId),
        eq(evidenceTable.verified, true),
        latest
          ? or(isNull(evidenceTable.assessmentId), eq(evidenceTable.assessmentId, latest.id))
          : isNull(evidenceTable.assessmentId),
      ),
    )
    .orderBy(evidenceTable.id);
  return rows.map((r) => r.quote);
}

async function runReassessment(requestId: number, log: Logger): Promise<void> {
  try {
    const [req] = await db.select().from(reassessmentRequestsTable).where(eq(reassessmentRequestsTable.id, requestId));
    const [risk] = await db.select().from(risksTable).where(eq(risksTable.id, req!.riskId));
    const [doc] = await db.select().from(documentsTable).where(eq(documentsTable.id, req!.evidenceDocumentId));
    const [action] = req!.actionId
      ? await db.select().from(mitigationActionsTable).where(eq(mitigationActionsTable.id, req!.actionId))
      : [];
    if (!risk || !doc) throw new Error("The risk or evidence document was deleted before the reassessment ran.");

    const ai = await reassessRisk({
      risk: {
        title: risk.title,
        description: risk.description,
        category: risk.category,
        severity: risk.severity,
        likelihood: risk.likelihood,
        businessImpact: risk.businessImpact,
      },
      originalQuotes: await currentVerifiedQuotes(risk.id),
      action: action
        ? {
            description: action.description,
            owner: action.owner,
            dueDate: action.dueDate,
            status: action.status,
            evidenceNote: action.evidenceNote,
          }
        : null,
      evidenceTitle: doc.title,
      evidenceText: doc.content,
    });

    const quotes = verifyQuotes(doc.content, ai.evidenceQuotes);
    const quotesVerified = quotes.filter((q) => q.result.matchType !== "not_found").length;
    const { verdict, notes } = applyReassessmentRules({ ai, quotesTotal: quotes.length, quotesVerified });

    // Recorded as a new history entry only. The risk row (status included) is not touched.
    await db.transaction(async (tx) => {
      const [assessment] = await tx
        .insert(assessmentsTable)
        .values({
          riskId: risk.id,
          kind: "reassessment",
          verdict,
          aiVerdict: ai.outcome,
          rationale: ai.explanation,
          confidence: ai.confidence,
          evidenceDocumentId: doc.id,
          model: ANALYSIS_MODEL,
          actionId: action?.id ?? null,
          evidenceType: ai.evidenceType,
          requirementsMet: ai.requirementsMet,
          remainingGaps: ai.remainingGaps,
          nextSteps: ai.nextSteps,
          guardrailNotes: notes,
        })
        .returning({ id: assessmentsTable.id });
      if (quotes.length) {
        await tx.insert(evidenceTable).values(
          quotes.map(({ claimed, result }) => ({
            riskId: risk.id,
            documentId: doc.id,
            assessmentId: assessment!.id,
            quote: result.matchType === "not_found" ? claimed.trim() : doc.content.slice(result.start, result.end),
            claimedQuote: claimed,
            matchType: result.matchType,
            normalizations: result.normalizations,
            matchCount: result.matchCount,
            startOffset: result.start,
            endOffset: result.end,
            verified: result.matchType !== "not_found",
            pageNumber: result.start === null ? null : pageForOffset(doc.pageOffsets, result.start),
          })),
        );
      }
      await tx
        .update(reassessmentRequestsTable)
        .set({ status: "completed", assessmentId: assessment!.id, finishedAt: new Date() })
        .where(eq(reassessmentRequestsTable.id, requestId));
    });
    log.info(
      { requestId, riskId: risk.id, aiOutcome: ai.outcome, verdict, quotes: quotes.length, quotesVerified },
      "Reassessment completed",
    );
  } catch (err) {
    log.error({ err, requestId }, "Reassessment failed");
    // Only the request records the failure; the risk and its history are unchanged.
    await db
      .update(reassessmentRequestsTable)
      .set({ status: "failed", error: userFacingError(err, "reassessment"), finishedAt: new Date() })
      .where(eq(reassessmentRequestsTable.id, requestId))
      .catch((dbErr) => log.error({ err: dbErr, requestId }, "Could not record reassessment failure"));
  }
}

/** Reassessments run in-process; any left pending after a restart were interrupted. */
export async function failInterruptedReassessments(log: Logger): Promise<void> {
  const rows = await db
    .update(reassessmentRequestsTable)
    .set({
      status: "failed",
      error: "The reassessment was interrupted by a server restart. Submit it again.",
      finishedAt: new Date(),
    })
    .where(eq(reassessmentRequestsTable.status, "pending"))
    .returning({ id: reassessmentRequestsTable.id });
  if (rows.length) log.warn({ requestIds: rows.map((r) => r.id) }, "Marked interrupted reassessments as failed");
}
