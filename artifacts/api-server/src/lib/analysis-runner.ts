import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
  type DocumentRow,
} from "@workspace/db";
import { chunkText, type TextChunk } from "./chunking";
import { locateQuote, pageForOffset } from "./evidence-locator";
import { analyzeChunk, type AiRisk } from "./ai/risk-analysis";
import {
  ANALYSIS_MODEL,
  AiNotConfiguredError,
  MalformedAiOutputError,
  isAiConfigured,
} from "./ai/client";

const CHUNK_CONCURRENCY = 3;
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
const LIKELIHOOD_RANK = { low: 0, medium: 1, high: 2 } as const;

export type StartResult =
  | { ok: true; document: DocumentRow }
  | { ok: false; status: 404 | 409 | 503; error: string };

/**
 * Atomically claim the document for analysis, then run it in the background.
 * The conditional UPDATE is the duplicate-submission guard: two concurrent
 * requests cannot both move a document into "analyzing".
 */
export async function startAnalysis(
  documentId: number,
  replaceExisting: boolean,
  log: Logger,
): Promise<StartResult> {
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
        replaceExisting
          ? ne(documentsTable.status, "analyzing")
          : inArray(documentsTable.status, ["uploaded", "failed"]),
      ),
    )
    .returning();

  if (!claimed) {
    return existing.status === "analyzing"
      ? { ok: false, status: 409, error: "This document is already being analyzed." }
      : {
          ok: false,
          status: 409,
          error: "This document has already been analyzed. Re-run with replaceExisting to replace its risks.",
        };
  }

  log.info({ documentId, chunks: chunks.length, replaceExisting }, "Analysis started");
  void runAnalysis(claimed, chunks, replaceExisting, log);
  return { ok: true, document: claimed };
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

function titleKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Overlapping sections can report the same risk twice; merge by title. */
export function mergeRisks(perChunk: AiRisk[][]): AiRisk[] {
  const merged = new Map<string, AiRisk>();
  for (const risk of perChunk.flat()) {
    const key = titleKey(risk.title);
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, { ...risk, evidenceQuotes: [...risk.evidenceQuotes] });
      continue;
    }
    for (const q of risk.evidenceQuotes) {
      if (!prev.evidenceQuotes.some((p) => p.trim() === q.trim())) prev.evidenceQuotes.push(q);
    }
    if (SEVERITY_RANK[risk.severity] > SEVERITY_RANK[prev.severity]) prev.severity = risk.severity;
    if (LIKELIHOOD_RANK[risk.likelihood] > LIKELIHOOD_RANK[prev.likelihood]) prev.likelihood = risk.likelihood;
    prev.confidence = Math.max(prev.confidence, risk.confidence);
  }
  return [...merged.values()];
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

async function runAnalysis(
  doc: DocumentRow,
  chunks: TextChunk[],
  replaceExisting: boolean,
  log: Logger,
): Promise<void> {
  try {
    const perChunk = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk) => {
      const risks = await analyzeChunk({
        documentTitle: doc.title,
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

    const risks = mergeRisks(perChunk);
    let verifiedCount = 0;
    let quoteCount = 0;

    // All-or-nothing: previous results are only replaced if the new run is saved in full.
    await db.transaction(async (tx) => {
      if (replaceExisting) await tx.delete(risksTable).where(eq(risksTable.documentId, doc.id));

      for (const r of risks) {
        const [risk] = await tx
          .insert(risksTable)
          .values({
            documentId: doc.id,
            title: r.title,
            description: r.description,
            category: r.category,
            severity: r.severity,
            likelihood: r.likelihood,
            businessImpact: r.businessImpact,
            reviewNotes: r.reviewNotes,
          })
          .returning({ id: risksTable.id });

        const evidenceRows = r.evidenceQuotes.map((quote) => {
          const loc = locateQuote(doc.content, quote);
          quoteCount++;
          if (loc) verifiedCount++;
          return {
            riskId: risk!.id,
            documentId: doc.id,
            // Store the exact source text when found, so the quote always matches the document.
            quote: loc ? doc.content.slice(loc.start, loc.end) : quote,
            startOffset: loc?.start ?? null,
            endOffset: loc?.end ?? null,
            verified: loc !== null,
            pageNumber: loc ? pageForOffset(doc.pageOffsets, loc.start) : null,
          };
        });
        await tx.insert(evidenceTable).values(evidenceRows);
        await tx.insert(mitigationActionsTable).values({ riskId: risk!.id, description: r.recommendedMitigation });
        await tx.insert(assessmentsTable).values({
          riskId: risk!.id,
          kind: "initial",
          verdict: "identified",
          rationale: r.rationale,
          confidence: r.confidence,
          evidenceDocumentId: doc.id,
          model: ANALYSIS_MODEL,
        });
      }

      await tx
        .update(documentsTable)
        .set({ status: "analyzed", analyzedAt: new Date(), analysisModel: ANALYSIS_MODEL, analysisError: null })
        .where(eq(documentsTable.id, doc.id));
    });

    log.info({ documentId: doc.id, risks: risks.length, quoteCount, verifiedCount }, "Analysis completed");
  } catch (err) {
    log.error({ err, documentId: doc.id }, "Analysis failed");
    // A failed re-run keeps the previous results visible; only the status reflects the failure.
    await db
      .update(documentsTable)
      .set({ status: "failed", analysisError: userFacingError(err) })
      .where(eq(documentsTable.id, doc.id))
      .catch((dbErr) => log.error({ err: dbErr, documentId: doc.id }, "Could not record analysis failure"));
  }
}

/** Analyses run in-process; any left "analyzing" after a restart were interrupted. */
export async function failInterruptedAnalyses(log: Logger): Promise<void> {
  const rows = await db
    .update(documentsTable)
    .set({ status: "failed", analysisError: "The analysis was interrupted by a server restart. Run it again." })
    .where(eq(documentsTable.status, "analyzing"))
    .returning({ id: documentsTable.id });
  if (rows.length) log.warn({ documentIds: rows.map((r) => r.id) }, "Marked interrupted analyses as failed");
}
