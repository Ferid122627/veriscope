import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
} from "@workspace/db";
import { GetDashboardSummaryResponse, GetRecentActivityResponse } from "@workspace/api-zod";

const router: IRouter = Router();

const ACTIVITY_LIMIT = 20;

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
        resolved: sql<number>`count(*) filter (where ${risksTable.status} = 'resolved')::int`,
      })
      .from(risksTable),
    db
      .select({ open: sql<number>`count(*) filter (where ${mitigationActionsTable.status} <> 'done')::int` })
      .from(mitigationActionsTable),
    db
      .select({
        total: sql<number>`count(*)::int`,
        verified: sql<number>`count(*) filter (where ${evidenceTable.verified})::int`,
      })
      .from(evidenceTable),
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
      risksByStatus: { open: risks!.open, mitigating: risks!.mitigating, resolved: risks!.resolved },
      openActions: actions!.open,
      totalEvidence: evidence!.total,
      verifiedEvidence: evidence!.verified,
      totalAssessments: assessments!.total,
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
      message: `${a.kind === "initial" ? "Initial assessment" : "Reassessment"}: ${a.riskTitle} — ${a.verdict.replace(/_/g, " ")}`,
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
