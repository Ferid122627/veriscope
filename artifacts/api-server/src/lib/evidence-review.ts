// Deterministic rules that decide a risk's evidence status and whether a human
// must review it. Computed only from verification against the source text and
// the AI's declared basis; the AI's own claims never mark evidence as verified.
import type { QuoteVerification } from "./evidence-locator";

export type EvidenceBasis = "direct" | "inferred" | "none";
export type EvidenceStatus = "verified" | "partially_verified" | "unverified" | "no_evidence";

export const LOW_CONFIDENCE = 0.5;

export interface EvidenceReviewInput {
  basis: EvidenceBasis;
  quotes: QuoteVerification[];
  interpretationNote: string | null;
  aiNeedsReview: boolean;
  confidence: number;
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
