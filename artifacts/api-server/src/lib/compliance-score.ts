import { sql } from "drizzle-orm";
import type { RiskSeverity } from "@workspace/db";

/**
 * Compliance score: start at 100 and deduct a fixed number of points per risk,
 * by severity. Computed by the server from saved risks, never by the AI, so the
 * same risks always give the same score.
 *
 * Counted: risks that are not closed, except those whose quotes could not be
 * found in the document ("unverified"); those may be invented and are left for
 * a person to review instead of lowering the score. A missing clause cannot be
 * quoted ("no_evidence"), so it still counts.
 */
export const SCORE_DEDUCTIONS: Record<RiskSeverity, number> = { critical: 18, high: 12, medium: 7, low: 2 };
const ORDER: RiskSeverity[] = ["critical", "high", "medium", "low"];

export interface ScoredRisk {
  severity: RiskSeverity;
  status: string;
  evidenceStatus: string;
}

export interface ComplianceBreakdown {
  score: number;
  countedRisks: number;
  excludedUnverified: number;
  excludedClosed: number;
  deductions: { severity: RiskSeverity; count: number; pointsEach: number; points: number }[];
}

export function computeCompliance(risks: ScoredRisk[]): ComplianceBreakdown {
  const counted = risks.filter((r) => r.status !== "closed" && r.evidenceStatus !== "unverified");
  const deductions = ORDER.map((severity) => {
    const count = counted.filter((r) => r.severity === severity).length;
    return { severity, count, pointsEach: SCORE_DEDUCTIONS[severity], points: count * SCORE_DEDUCTIONS[severity] };
  });
  const total = deductions.reduce((n, d) => n + d.points, 0);
  return {
    score: Math.max(0, 100 - total),
    countedRisks: counted.length,
    excludedUnverified: risks.filter((r) => r.status !== "closed" && r.evidenceStatus === "unverified").length,
    excludedClosed: risks.filter((r) => r.status === "closed").length,
    deductions,
  };
}

/**
 * The same score as a SQL expression for document lists (correlated on
 * "documents"."id"). Null until the document has been checked at least once.
 */
export const complianceScoreSql = sql<number | null>`(
  select case when "documents"."analyzed_at" is null then null else greatest(0, 100 - coalesce(sum(
    case r.severity
      when 'critical' then ${sql.raw(String(SCORE_DEDUCTIONS.critical))}
      when 'high' then ${sql.raw(String(SCORE_DEDUCTIONS.high))}
      when 'medium' then ${sql.raw(String(SCORE_DEDUCTIONS.medium))}
      else ${sql.raw(String(SCORE_DEDUCTIONS.low))} end
  ), 0))::int end
  from risks r
  where r.document_id = "documents"."id" and r.status <> 'closed' and r.evidence_status <> 'unverified'
)`;
