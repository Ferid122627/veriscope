import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  mitigationActionsTable,
  assessmentsTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse, GetRecentActivityResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const ACTIVITY_LIMIT = 20;
const ASSESSMENT_KIND_LABEL = { initial: "Initial assessment", reanalysis: "Re-analysis", reassessment: "Reassessment" } as const;

router.get("/dashboard/summary", async (_req, res) => {
  const [[docs], [risks], [actions], [evidence], [assessments]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(documentsTable),
    db
      .select({
        total: sql<number>`count(*)::int`,
        low: sql<number>`count(*) filter (where ${risksTable.severity} = 'low')::int`,
        medium: sql<number>`count(*) filter (where ${risksTable.severity} = 'medium')::int`,
        high: sql<number>`count(*) filter (where ${risksTable.severity} = 'high')::int`,
        critical: sql<number>`count(*) filter (where ${risksTable.severity} = 'critical')::int`,
        open: sql<number>`count(*) filter (where ${risksTable.status} = 'open')::int`,
        mitigating: sql<number>`count(*) filter (where ${risksTable.status} = 'mitigating')::int`,
        closed: sql<number>`count(*) filter (where ${risksTable.status} = 'closed')::int`,
        review: sql<number>`count(*) filter (where ${risksTable.reviewRequired})::int`,
      })
      .from(risksTable),
    db
      .select({ open: sql<number>`count(*) filter (where ${mitigationActionsTable.status} in ('open', 'in_progress'))::int` })
      .from(mitigationActionsTable),
    // Only each risk's current evidence set, so re-analysis does not double-count quotes.
    db.execute<{ total: number; verified: number }>(sql`
      select count(*)::int as total, (count(*) filter (where e.verified))::int as verified
      from evidence e
      where e.assessment_id is null or e.assessment_id = (
        select a.id from assessments a
        where a.risk_id = e.risk_id and a.verdict = 'identified'
        order by a.created_at desc, a.id desc limit 1
      )`).then((r) => r.rows),
    db.select({ total: sql<number>`count(*)::int` }).from(assessmentsTable),
  ]);

  res.json(
    GetDashboardSummaryResponse.parse({
      totalDocuments: docs!.total,
      totalRisks: risks!.total,
      risksBySeverity: {
        low: risks!.low,
        medium: risks!.medium,
        high: risks!.high,
        critical: risks!.critical,
      },
      risksByStatus: { open: risks!.open, mitigating: risks!.mitigating, closed: risks!.closed },
      openActions: actions!.open,
      totalEvidence: evidence!.total,
      verifiedEvidence: evidence!.verified,
      totalAssessments: assessments!.total,
      risksRequiringReview: risks!.review,
    }),
  );
});

// Activity is derived from real rows (documents, risks, assessments) rather
// than a separate event log, so it can never drift from the data.
router.get("/dashboard/activity", async (_req, res) => {
  const [docs, risks, assessments] = await Promise.all([
    db
      .select({ id: documentsTable.id, title: documentsTable.title, createdAt: documentsTable.createdAt })
      .from(documentsTable)
      .orderBy(desc(documentsTable.createdAt))
      .limit(ACTIVITY_LIMIT),
    db
      .select({
        id: risksTable.id,
        title: risksTable.title,
        severity: risksTable.severity,
        documentId: risksTable.documentId,
        createdAt: risksTable.createdAt,
      })
      .from(risksTable)
      .orderBy(desc(risksTable.createdAt))
      .limit(ACTIVITY_LIMIT),
    db
      .select({
        id: assessmentsTable.id,
        riskId: assessmentsTable.riskId,
        verdict: assessmentsTable.verdict,
        kind: assessmentsTable.kind,
        riskTitle: risksTable.title,
        documentId: risksTable.documentId,
        createdAt: assessmentsTable.createdAt,
      })
      .from(assessmentsTable)
      .innerJoin(risksTable, eq(risksTable.id, assessmentsTable.riskId))
      .orderBy(desc(assessmentsTable.createdAt))
      .limit(ACTIVITY_LIMIT),
  ]);

  const items = [
    ...docs.map((d) => ({
      id: `document-${d.id}`,
      type: "document_added" as const,
      message: `Document added: ${d.title}`,
      createdAt: d.createdAt,
      documentId: d.id,
      riskId: null,
    })),
    ...risks.map((r) => ({
      id: `risk-${r.id}`,
      type: "risk_identified" as const,
      message: `${r.severity[0]!.toUpperCase()}${r.severity.slice(1)} risk identified: ${r.title}`,
      createdAt: r.createdAt,
      documentId: r.documentId,
      riskId: r.id,
    })),
    ...assessments.map((a) => ({
      id: `assessment-${a.id}`,
      type: "assessment_recorded" as const,
      message: `${ASSESSMENT_KIND_LABEL[a.kind]}: ${a.riskTitle} — ${a.verdict.replace(/_/g, " ")}`,
      createdAt: a.createdAt,
      documentId: a.documentId,
      riskId: a.riskId,
    })),
  ]
    .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
    .slice(0, ACTIVITY_LIMIT);

  res.json(GetRecentActivityResponse.parse(items));
});

export default router;
