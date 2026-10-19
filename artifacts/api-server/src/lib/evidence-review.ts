// Deterministic rules that decide a risk's evidence status and whether a human
// must review it. Computed only from verification against the source text and
// the AI's declared basis; the AI's own claims never mark evidence as verified.
import type { QuoteVerification } from "./evidence-locator";

export type EvidenceBasis = "direct" | "inferred" | "none";
export type EvidenceStatus = "verified" | "partially_verified" | "unverified" | "no_evidence";

/**
 * Whether the quoted text itself establishes the finding. This is the AI's own
 * judgement, separate from the deterministic check that the quote exists in the
 * source. "invalid" is never produced by the model: it marks a missing or
 * malformed answer and is treated as "not supported".
 */
export const QUOTE_SUPPORT_VALUES = ["supports", "partial", "does_not_support"] as const;
export type QuoteSupport = (typeof QUOTE_SUPPORT_VALUES)[number] | "invalid";

export const LOW_CONFIDENCE = 0.5;

export interface EvidenceReviewInput {
  basis: EvidenceBasis;
  quotes: QuoteVerification[];
  interpretationNote: string | null;
  aiNeedsReview: boolean;
  confidence: number;
  quoteSupport: QuoteSupport;
  supportGap: string | null;
  /** Number of separate, non-adjacent passages the quotes come from (see countSeparatePassages). */
  separatePassages?: number;
}

/**
 * How many separate passages the located quotes come from. Quotes that overlap,
 * or that are separated only by whitespace, count as one passage. Quotes that
 * were not found, or that occur more than once (so their location is
 * ambiguous), are ignored rather than guessed at.
 */
export function countSeparatePassages(content: string, quotes: QuoteVerification[]): number {
  const spans = quotes
    .flatMap((q) => (q.matchType !== "not_found" && q.matchCount === 1 ? [{ start: q.start, end: q.end }] : []))
    .sort((a, b) => a.start - b.start);
  let passages = 0;
  let currentEnd = -1;
  for (const span of spans) {
    const adjacent = passages > 0 && (span.start <= currentEnd || content.slice(currentEnd, span.start).trim() === "");
    if (!adjacent) passages++;
    currentEnd = Math.max(currentEnd, span.end);
  }
  return passages;
}

export interface EvidenceReview {
  evidenceStatus: EvidenceStatus;
  reviewRequired: boolean;
  reviewReasons: string[];
}

export function evidenceStatusOf(quotes: Pick<QuoteVerification, "matchType">[]): EvidenceStatus {
  if (quotes.length === 0) return "no_evidence";
  const verified = quotes.filter((q) => q.matchType !== "not_found").length;
  if (verified === quotes.length) return "verified";
  return verified === 0 ? "unverified" : "partially_verified";
}

export function reviewEvidence(input: EvidenceReviewInput): EvidenceReview {
  const { quotes } = input;
  const evidenceStatus = evidenceStatusOf(quotes);
  const reasons: string[] = [];

  if (quotes.length === 0) {
    reasons.push("No supporting quotation: the finding is not backed by text from the document.");
  } else {
    const missing = quotes.filter((q) => q.matchType === "not_found").length;
    if (missing === quotes.length) {
      reasons.push(
        quotes.length === 1
          ? "The quotation could not be found in the source text."
          : `None of the ${quotes.length} quotations could be found in the source text.`,
      );
    } else if (missing > 0) {
      reasons.push(`${missing} of ${quotes.length} quotations could not be found in the source text.`);
    }
    for (const q of quotes) {
      if (q.matchCount > 1) {
        reasons.push(`A quotation appears ${q.matchCount} times in the document, so its location is ambiguous.`);
        break;
      }
    }
  }
  // Exact text matching only proves the quote exists; whether it supports the
  // finding is a separate question. Anything but a valid "supports" needs a human.
  if (quotes.length > 0 && input.quoteSupport !== "supports") {
    const gap = input.supportGap ? `: ${input.supportGap}` : ".";
    if (input.quoteSupport === "partial") {
      reasons.push(`The AI says the quoted text only partly supports this finding${gap}`);
    } else if (input.quoteSupport === "does_not_support") {
      reasons.push(`The AI says the quoted text does not support this finding${gap}`);
    } else {
      reasons.push("The AI did not give a valid assessment of whether the quoted text supports this finding.");
    }
  }
  if (input.basis === "direct" && (input.separatePassages ?? 0) >= 2) {
    reasons.push(
      `Labelled direct, but the quotations come from ${input.separatePassages} separate passages, so the finding combines several parts of the document.`,
    );
  }
  if (input.basis === "inferred") {
    reasons.push(
      input.interpretationNote
        ? "The risk is an interpretation of several passages, not a direct quotation."
        : "The risk is an interpretation of several passages, and no explanation of the interpretation was given.",
    );
  }
  if (input.aiNeedsReview) reasons.push("The AI flagged this finding as uncertain.");
  if (input.confidence < LOW_CONFIDENCE) reasons.push(`Low AI confidence (${Math.round(input.confidence * 100)}%).`);

  return { evidenceStatus, reviewRequired: reasons.length > 0, reviewReasons: reasons };
}

export function notDetectedReason(runId: number): string {
  return `Not detected when the document was re-analyzed (analysis run #${runId}). Kept for review; not resolved.`;
}
