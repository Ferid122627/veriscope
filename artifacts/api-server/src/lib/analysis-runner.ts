import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
  analysisRunsTable,
  type DocumentRow,
} from "@workspace/db";
import { chunkText, type TextChunk } from "./chunking";
import { verifyQuote, pageForOffset, type QuoteVerification } from "./evidence-locator";
import { analyzeChunk, type AiRisk, type ExistingRiskRef } from "./ai/risk-analysis";
import { reviewEvidence, notDetectedReason, type EvidenceBasis } from "./evidence-review";
import {
  ANALYSIS_MODEL,
  AiNotConfiguredError,
  MalformedAiOutputError,
  isAiConfigured,
} from "./ai/client";

const CHUNK_CONCURRENCY = 3;
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
const LIKELIHOOD_RANK = { low: 0, medium: 1, high: 2 } as const;
const BASIS_RANK = { none: 0, inferred: 1, direct: 2 } as const;

export type StartResult =
  | { ok: true; document: DocumentRow; runId: number }
  | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Atomically claim the document for analysis, then run it in the background.
 * The conditional UPDATE is the duplicate-submission guard: two concurrent
 * requests cannot both move a document into "analyzing".
 */
export async function startAnalysis(documentId: number, rerun: boolean, log: Logger): Promise<StartResult> {
  if (!isAiConfigured()) return { ok: false, status: 503, error: new AiNotConfiguredError().message };

  const [existing] = await db
    .select({ content: documentsTable.content, status: documentsTable.status })
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId));
  if (!existing) return { ok: false, status: 404, error: "Document not found" };

  const chunks = chunkText(existing.content);
  const [claimed] = await db
    .update(documentsTable)
    .set({
      status: "analyzing",
      analysisError: null,
      chunksTotal: chunks.length,
      chunksDone: 0,
      analysisStartedAt: new Date(),
    })
    .where(
      and(
        eq(documentsTable.id, documentId),
        rerun ? ne(documentsTable.status, "analyzing") : inArray(documentsTable.status, ["uploaded", "failed"]),
      ),
    )
    .returning();

  if (!claimed) {
    return existing.status === "analyzing"
      ? { ok: false, status: 409, error: "This document is already being analyzed." }
      : {
          ok: false,
          status: 409,
          error: "This document has already been analyzed. Send rerun: true to analyze it again.",
        };
  }

  const [run] = await db
    .insert(analysisRunsTable)
    .values({ documentId, model: ANALYSIS_MODEL, chunksTotal: chunks.length })
    .returning({ id: analysisRunsTable.id });

  log.info({ documentId, runId: run!.id, chunks: chunks.length, rerun }, "Analysis started");
  void runAnalysis(claimed, run!.id, chunks, log);
  return { ok: true, document: claimed, runId: run!.id };
}

/** Run fn over items with bounded concurrency, preserving order. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type MergedRisk = AiRisk & { matchedRiskId: number | null };

/**
 * Combine findings from all sections into one list without duplicates.
 * A finding is attached to an existing risk when the AI names a valid existing
 * id, or when its title matches an existing risk's title; otherwise findings
 * are merged with each other by title (overlapping sections repeat risks).
 */
export function mergeRisks(perChunk: AiRisk[][], existing: Pick<ExistingRiskRef, "id" | "title">[] = []): MergedRisk[] {
  const existingIds = new Set(existing.map((r) => r.id));
  const existingByTitle = new Map(existing.map((r) => [titleKey(r.title), r.id]));
  const merged = new Map<string, MergedRisk>();

  for (const risk of perChunk.flat()) {
    const claimed = risk.matchesExistingRiskId;
    const matchedRiskId =
      claimed !== null && existingIds.has(claimed) ? claimed : (existingByTitle.get(titleKey(risk.title)) ?? null);
    const key = matchedRiskId !== null ? `id:${matchedRiskId}` : `title:${titleKey(risk.title)}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...risk, evidenceQuotes: [...risk.evidenceQuotes], matchedRiskId });
      continue;
    }
    for (const q of risk.evidenceQuotes) {
      if (!prev.evidenceQuotes.some((p) => p.trim() === q.trim())) prev.evidenceQuotes.push(q);
    }
    if (SEVERITY_RANK[risk.severity] > SEVERITY_RANK[prev.severity]) prev.severity = risk.severity;
    if (LIKELIHOOD_RANK[risk.likelihood] > LIKELIHOOD_RANK[prev.likelihood]) prev.likelihood = risk.likelihood;
    if (BASIS_RANK[risk.evidenceBasis] > BASIS_RANK[prev.evidenceBasis]) prev.evidenceBasis = risk.evidenceBasis;
    prev.interpretationNote ??= risk.interpretationNote;
    prev.reviewNotes ??= risk.reviewNotes;
    prev.needsHumanReview ||= risk.needsHumanReview;
    prev.confidence = Math.max(prev.confidence, risk.confidence);
  }
  return [...merged.values()];
}

/** The basis actually recorded: quotes decide whether anything was cited at all. */
export function effectiveBasis(risk: Pick<AiRisk, "evidenceBasis" | "evidenceQuotes">): EvidenceBasis {
  if (risk.evidenceQuotes.length === 0) return "none";
  return risk.evidenceBasis === "none" ? "inferred" : risk.evidenceBasis;
}

function userFacingError(err: unknown): string {
  if (err instanceof AiNotConfiguredError || err instanceof MalformedAiOutputError) return err.message;
  const status = (err as { status?: number })?.status;
  if (status === 429) return "The AI provider is rate-limiting requests. Wait a minute and retry the analysis.";
  if (typeof status === "number") return `The AI provider returned an error (HTTP ${status}). Retry the analysis.`;
  if ((err as Error)?.name === "APIConnectionTimeoutError") return "The AI provider timed out. Retry the analysis.";
  if ((err as Error)?.name === "APIConnectionError") return "Could not reach the AI provider. Retry the analysis.";
  return "The analysis failed unexpectedly. Retry the analysis.";
}

interface VerifiedQuote {
  claimed: string;
  result: QuoteVerification;
}

/** Verify each quote against the source; drop repeats that resolve to the same span. */
function verifyQuotes(content: string, quotes: string[]): VerifiedQuote[] {
  const seen = new Set<string>();
  const out: VerifiedQuote[] = [];
  for (const claimed of quotes) {
    const result = verifyQuote(content, claimed);
    const key = result.matchType === "not_found" ? `claim:${claimed.trim()}` : `span:${result.start}-${result.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ claimed, result });
  }
  return out;
}

async function runAnalysis(doc: DocumentRow, runId: number, chunks: TextChunk[], log: Logger): Promise<void> {
  try {
    const existing = await db
      .select({
        id: risksTable.id,
        title: risksTable.title,
        description: risksTable.description,
        reviewReasons: risksTable.reviewReasons,
      })
      .from(risksTable)
      .where(eq(risksTable.documentId, doc.id));

    const perChunk = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk) => {
      const risks = await analyzeChunk({
        documentTitle: doc.title,
        existingRisks: existing,
        chunk,
        totalChunks: chunks.length,
        totalChars: doc.content.length,
      });
      await db
        .update(documentsTable)
        .set({ chunksDone: sql`coalesce(${documentsTable.chunksDone}, 0) + 1` })
        .where(eq(documentsTable.id, doc.id));
      return risks;
    });

    const risks = mergeRisks(perChunk, existing);
    const matchedIds = new Set(risks.flatMap((r) => (r.matchedRiskId !== null ? [r.matchedRiskId] : [])));
    const notDetected = existing.filter((r) => !matchedIds.has(r.id));
    let quoteCount = 0;
    let verifiedCount = 0;

    // All-or-nothing: nothing from this run is visible unless all of it is saved.
    // Existing risks are never deleted; each one gains an assessment row instead.
    await db.transaction(async (tx) => {
      for (const r of risks) {
        const basis = effectiveBasis(r);
        const quotes = verifyQuotes(doc.content, r.evidenceQuotes);
        quoteCount += quotes.length;
        verifiedCount += quotes.filter((q) => q.result.matchType !== "not_found").length;
        const review = reviewEvidence({
          basis,
          quotes: quotes.map((q) => q.result),
          interpretationNote: r.interpretationNote,
          aiNeedsReview: r.needsHumanReview,
          confidence: r.confidence,
        });
        const current = {
          description: r.description,
          category: r.category,
          severity: r.severity,
          likelihood: r.likelihood,
          businessImpact: r.businessImpact,
          reviewNotes: r.reviewNotes,
          recommendedMitigation: r.recommendedMitigation,
          evidenceBasis: basis,
          interpretationNote: basis === "inferred" ? r.interpretationNote : null,
          ...review,
          lastAnalysisRunId: runId,
        };

        let riskId: number;
        if (r.matchedRiskId !== null) {
          // Same issue as an existing risk: keep its id, title and human-set status.
          riskId = r.matchedRiskId;
          await tx.update(risksTable).set({ ...current, updatedAt: new Date() }).where(eq(risksTable.id, riskId));
        } else {
          const [row] = await tx
            .insert(risksTable)
            .values({ documentId: doc.id, title: r.title, ...current })
            .returning({ id: risksTable.id });
          riskId = row!.id;
          await tx.insert(mitigationActionsTable).values({ riskId, description: r.recommendedMitigation });
        }

        const [assessment] = await tx
          .insert(assessmentsTable)
          .values({
            riskId,
            kind: r.matchedRiskId !== null ? "reanalysis" : "initial",
            verdict: "identified",
            rationale: r.rationale,
            confidence: r.confidence,
            evidenceDocumentId: doc.id,
            model: ANALYSIS_MODEL,
            analysisRunId: runId,
            severity: r.severity,
            likelihood: r.likelihood,
            evidenceBasis: basis,
          })
          .returning({ id: assessmentsTable.id });

        if (quotes.length) {
          await tx.insert(evidenceTable).values(
            quotes.map(({ claimed, result }) => ({
              riskId,
              documentId: doc.id,
              assessmentId: assessment!.id,
              // Located: the exact source characters. Not located: the claim, clearly unverified.
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
      }

      for (const r of notDetected) {
        const reason = notDetectedReason(runId);
        await tx.insert(assessmentsTable).values({
          riskId: r.id,
          kind: "reanalysis",
          verdict: "not_detected",
          rationale:
            "This risk was not identified when the document was analyzed again. It is kept with its earlier evidence for a human to confirm; it has not been resolved.",
          evidenceDocumentId: doc.id,
          model: ANALYSIS_MODEL,
          analysisRunId: runId,
        });
        const kept = r.reviewReasons.filter((x) => !x.startsWith("Not detected when the document was re-analyzed"));
        await tx
          .update(risksTable)
          .set({ reviewRequired: true, reviewReasons: [...kept, reason], updatedAt: new Date() })
          .where(eq(risksTable.id, r.id));
      }

      const risksMatched = risks.filter((r) => r.matchedRiskId !== null).length;
      await tx
        .update(analysisRunsTable)
        .set({
          status: "completed",
          finishedAt: new Date(),
          risksIdentified: risks.length,
          risksNew: risks.length - risksMatched,
          risksMatched,
          risksNotDetected: notDetected.length,
        })
        .where(eq(analysisRunsTable.id, runId));
      await tx
        .update(documentsTable)
        .set({ status: "analyzed", analyzedAt: new Date(), analysisModel: ANALYSIS_MODEL, analysisError: null })
        .where(eq(documentsTable.id, doc.id));
    });

    log.info(
      { documentId: doc.id, runId, risks: risks.length, notDetected: notDetected.length, quoteCount, verifiedCount },
      "Analysis completed",
    );
  } catch (err) {
    log.error({ err, documentId: doc.id, runId }, "Analysis failed");
    const error = userFacingError(err);
    // A failed run leaves earlier results untouched; only the status reflects the failure.
    await db
      .transaction(async (tx) => {
        await tx
          .update(analysisRunsTable)
          .set({ status: "failed", error, finishedAt: new Date() })
          .where(eq(analysisRunsTable.id, runId));
        await tx.update(documentsTable).set({ status: "failed", analysisError: error }).where(eq(documentsTable.id, doc.id));
      })
      .catch((dbErr) => log.error({ err: dbErr, documentId: doc.id }, "Could not record analysis failure"));
  }
}

/** Analyses run in-process; any left "analyzing" after a restart were interrupted. */
export async function failInterruptedAnalyses(log: Logger): Promise<void> {
  const error = "The analysis was interrupted by a server restart. Run it again.";
  const rows = await db
    .update(documentsTable)
    .set({ status: "failed", analysisError: error })
    .where(eq(documentsTable.status, "analyzing"))
    .returning({ id: documentsTable.id });
  await db
    .update(analysisRunsTable)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(analysisRunsTable.status, "running"));
  if (rows.length) log.warn({ documentIds: rows.map((r) => r.id) }, "Marked interrupted analyses as failed");
}
