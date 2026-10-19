import { RISK_KINDS, type RiskKind, type RiskSeverity } from "@workspace/db";
import type { EvidenceBasis, QuoteSupport } from "./evidence-review";

export { RISK_KINDS };
export type { RiskKind };

type Likelihood = "low" | "medium" | "high";
const RANK: Record<RiskSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const BY_RANK: RiskSeverity[] = ["low", "medium", "high", "critical"];
export const LOW_SEVERITY_CONFIDENCE = 0.5;

export const KIND_LABEL: Record<RiskKind, string> = {
  missing_protection: "A protection the document does not include",
  potential_risk: "A possible problem the wording allows",
  actual_issue: "A problem the document states outright",
};

export interface SeverityInput {
  aiSeverity: RiskSeverity;
  likelihood: Likelihood;
  /** Null when the model gave no classification. */
  riskKind: RiskKind | null | undefined;
  /** The basis actually recorded (quotes decide), not the one the model claimed. */
  basis: EvidenceBasis;
  quoteSupport: QuoteSupport;
  /** How many of the cited quotes were found in the source text. */
  quotesCited: number;
  quotesFound: number;
  confidence: number;
}

export interface SeverityResult {
  severity: RiskSeverity;
  adjusted: boolean;
  /** Plain-language sentences explaining each adjustment. */
  notes: string[];
}

/**
 * Cap the model's proposed severity using facts the server can check. The model
 * proposes; this only ever lowers, never raises, so a confident-sounding answer
 * cannot inflate a rating. Each cap is explained so the result is auditable.
 *
 *  - A missing clause is a gap, not harm: Medium at most, High only when the
 *    model also judged harm to be likely.
 *  - A possible problem is High at most.
 *  - Critical needs a problem the text states outright, with every quote found
 *    in the source and judged to support it.
 *  - Low likelihood caps at Medium (high impact x low likelihood is Medium).
 *  - Weak evidence (unfound quotes, quotes that do not support the finding, low
 *    confidence) caps at Medium and sends the finding to a person.
 */
export function calibrateSeverity(input: SeverityInput): SeverityResult {
  const { aiSeverity, likelihood, riskKind, basis, quoteSupport, quotesCited, quotesFound, confidence } = input;
  const notes: string[] = [];
  let cap = RANK.critical;
  const capAt = (max: RiskSeverity, note: string) => {
    if (RANK[max] < cap) cap = RANK[max];
    if (RANK[aiSeverity] > RANK[max]) notes.push(note);
  };

  if (riskKind === "missing_protection") {
    if (likelihood === "high") capAt("high", "A missing protection is rated High only when harm is likely and Critical never.");
    else capAt("medium", "A missing protection is a gap rather than harm that has happened, so it is rated Medium unless harm is likely.");
  } else if (riskKind === "actual_issue") {
    const solid = basis === "direct" && quoteSupport === "supports" && quotesCited > 0 && quotesFound === quotesCited;
    if (!solid) capAt("high", "Critical is kept for problems the document states outright and that are backed by a verified quote.");
  } else {
    capAt("high", "Critical is kept for problems the document states outright; this one is a possibility.");
  }

  if (likelihood === "low") capAt("medium", "The risk is judged unlikely, so it is rated no higher than Medium.");

  const weakQuotes = quotesCited > 0 && (quotesFound < quotesCited || quoteSupport !== "supports");
  const weak = weakQuotes || confidence < LOW_SEVERITY_CONFIDENCE;
  if (weak) capAt("medium", "The evidence is weak, so the rating is held at Medium until a person checks it.");

  const severity = BY_RANK[Math.min(RANK[aiSeverity], cap)]!;
  return { severity, adjusted: severity !== aiSeverity, notes };
}

const label = (s: RiskSeverity) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The text stored with the risk: what kind of finding it is, the model's own
 * reason for the rating, and any server-side adjustment, so a reader can see
 * why the level was chosen.
 */
export function describeSeverity(aiReason: string | null | undefined, riskKind: RiskKind | null | undefined, aiSeverity: RiskSeverity, result: SeverityResult): string {
  const parts: string[] = [];
  parts.push(riskKind ? `${KIND_LABEL[riskKind]}.` : "The AI did not say what kind of finding this is.");
  const reason = aiReason?.trim();
  if (reason) parts.push(/[.!?]$/.test(reason) ? reason : `${reason}.`);
  else parts.push("The AI gave no reason for this rating.");
  if (result.adjusted) parts.push(`Lowered from ${label(aiSeverity)} to ${label(result.severity)}: ${result.notes.join(" ")}`);
  return parts.join(" ");
}
