import type { ReassessmentOutcome } from "@workspace/db";
import type { AiReassessment } from "./ai/reassessment";

/** Below this confidence the AI may not recommend resolution on its own. */
export const MIN_RESOLUTION_CONFIDENCE = 0.6;

export interface RuleInput {
  ai: Pick<AiReassessment, "outcome" | "evidenceType" | "remainingGaps" | "confidence">;
  quotesTotal: number;
  quotesVerified: number;
}

export interface RuleResult {
  verdict: ReassessmentOutcome;
  notes: string[];
}

/**
 * Deterministic checks applied after the AI answers. They can only move an
 * outcome away from "resolved", never towards it, and each change is explained.
 */
export function applyReassessmentRules({ ai, quotesTotal, quotesVerified }: RuleInput): RuleResult {
  let verdict: ReassessmentOutcome = ai.outcome;
  const notes: string[] = [];
  const claimsProgress = () => verdict === "resolved" || verdict === "partially_resolved";

  if (claimsProgress() && ai.evidenceType === "unrelated") {
    verdict = "unresolved";
    notes.push("The AI classified the new evidence as unrelated to this risk, so it cannot show progress.");
  }
  if (verdict === "resolved" && ai.evidenceType === "plan_or_promise") {
    verdict = "unresolved";
    notes.push("The new evidence is a plan or promise; it does not prove the control is in place.");
  }
  if (verdict === "resolved" && (ai.evidenceType === "policy_or_design" || ai.evidenceType === "mixed")) {
    verdict = "partially_resolved";
    notes.push(
      ai.evidenceType === "mixed"
        ? "Part of the new evidence is policy, design or plans, which does not prove the control operates effectively."
        : "A policy or design document does not prove the control operates effectively.",
    );
  }
  if (verdict === "resolved" && ai.remainingGaps.length > 0) {
    verdict = "partially_resolved";
    notes.push("The AI listed remaining gaps, which is inconsistent with full resolution.");
  }
  if (claimsProgress() && quotesVerified === 0) {
    verdict = "needs_human_review";
    notes.push(
      quotesTotal === 0
        ? "The AI cited no passage from the new evidence to support its conclusion."
        : "None of the AI's quotations could be found in the new evidence document.",
    );
  }
  if (verdict === "resolved" && quotesVerified < quotesTotal) {
    verdict = "needs_human_review";
    notes.push(`${quotesTotal - quotesVerified} of ${quotesTotal} quotations could not be found in the new evidence document.`);
  }
  if (verdict === "resolved" && ai.confidence < MIN_RESOLUTION_CONFIDENCE) {
    verdict = "needs_human_review";
    notes.push(`The AI's confidence (${Math.round(ai.confidence * 100)}%) is too low to recommend resolution.`);
  }
  return { verdict, notes };
}
