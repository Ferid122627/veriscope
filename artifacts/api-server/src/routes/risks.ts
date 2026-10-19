import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
} from "@workspace/db";
import {
  GetRiskParams,
  GetRiskResponse,
  ListRisksQueryParams,
  ListRisksResponse,
} from "@workspace/api-zod";
import { documentSummaryColumns, toDocumentSummary } from "../lib/document-summary";

const router: IRouter = Router();

// The current evidence set is the one cited by the latest assessment that
// identified the risk; older sets stay attached to their own assessments.
// Evidence recorded without an assessment (manual entry) is always current.
const LATEST_IDENTIFYING_ASSESSMENT = sql.raw(`(
  select a.id from assessments a
  where a.risk_id = "risks"."id" and a.verdict = 'identified'
  order by a.created_at desc, a.id desc limit 1
)`);
const CURRENT_EVIDENCE = sql`(e.assessment_id is null or e.assessment_id = ${LATEST_IDENTIFYING_ASSESSMENT})`;

const riskColumns = {
  id: risksTable.id,
  documentId: risksTable.documentId,
  documentTitle: documentsTable.title,
  title: risksTable.title,
  description: risksTable.description,
  category: risksTable.category,
  severity: risksTable.severity,
  likelihood: risksTable.likelihood,
  businessImpact: risksTable.businessImpact,
  reviewNotes: risksTable.reviewNotes,
  recommendedMitigation: risksTable.recommendedMitigation,
  evidenceBasis: risksTable.evidenceBasis,
  interpretationNote: risksTable.interpretationNote,
  evidenceStatus: risksTable.evidenceStatus,
  reviewRequired: risksTable.reviewRequired,
  reviewReasons: risksTable.reviewReasons,
  status: risksTable.status,
  createdAt: risksTable.createdAt,
  updatedAt: risksTable.updatedAt,
  // Table-qualified so the correlation never binds to the subquery's own table.
  evidenceCount: sql<number>`(
    select count(*)::int from evidence e where e.risk_id = "risks"."id" and ${CURRENT_EVIDENCE}
  )`,
  verifiedEvidenceCount: sql<number>`(
    select count(*)::int from evidence e where e.risk_id = "risks"."id" and e.verified and ${CURRENT_EVIDENCE}
  )`,
  lastAssessedAt: sql<string | null>`(
    select max(a.created_at) from assessments a where a.risk_id = "risks"."id"
  )`.mapWith((v: string | null) => (v === null ? null : new Date(v))),
  openActionCount: sql<number>`(
    select count(*)::int from mitigation_actions m
    where m.risk_id = "risks"."id" and m.status <> 'done'
  )`,
};

const severityRank = sql`case ${risksTable.severity}
  when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

router.get("/risks", async (req, res) => {
  // z.coerce.boolean() would read the string "false" as true; parse it explicitly.
  const raw = { ...req.query } as Record<string, unknown>;
  if (raw["reviewRequired"] !== undefined) {
    if (raw["reviewRequired"] !== "true" && raw["reviewRequired"] !== "false") {
      res.status(400).json({ error: "reviewRequired must be true or false" });
      return;
    }
    raw["reviewRequired"] = raw["reviewRequired"] === "true";
  }
  const query = ListRisksQueryParams.safeParse(raw);
  if (!query.success) {
    res.status(400).json({ error: query.error.issues[0]?.message ?? "Invalid filters" });
    return;
  }
  const { severity, status, documentId, evidenceStatus, reviewRequired } = query.data;
  const filters: SQL[] = [];
  if (severity) filters.push(eq(risksTable.severity, severity));
  if (status) filters.push(eq(risksTable.status, status));
  if (documentId !== undefined) filters.push(eq(risksTable.documentId, documentId));
  if (evidenceStatus) filters.push(eq(risksTable.evidenceStatus, evidenceStatus));
  if (reviewRequired !== undefined) filters.push(eq(risksTable.reviewRequired, reviewRequired));

  const rows = await db
    .select(riskColumns)
    .from(risksTable)
    .innerJoin(documentsTable, eq(documentsTable.id, risksTable.documentId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(asc(severityRank), desc(risksTable.updatedAt));
  res.json(ListRisksResponse.parse(rows));
});

router.get("/risks/:id", async (req, res) => {
  const params = GetRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid risk id" });
    return;
  }
  const id = params.data.id;

  const [risk] = await db
    .select(riskColumns)
    .from(risksTable)
    .innerJoin(documentsTable, eq(documentsTable.id, risksTable.documentId))
    .where(eq(risksTable.id, id));
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }

  const [allEvidence, actions, assessmentRows, [sourceDocument]] = await Promise.all([
    db
      .select({
        id: evidenceTable.id,
        riskId: evidenceTable.riskId,
        documentId: evidenceTable.documentId,
        documentTitle: documentsTable.title,
        assessmentId: evidenceTable.assessmentId,
        quote: evidenceTable.quote,
        claimedQuote: evidenceTable.claimedQuote,
        matchType: evidenceTable.matchType,
        normalizations: evidenceTable.normalizations,
        matchCount: evidenceTable.matchCount,
        startOffset: evidenceTable.startOffset,
        endOffset: evidenceTable.endOffset,
        verified: evidenceTable.verified,
        pageNumber: evidenceTable.pageNumber,
        createdAt: evidenceTable.createdAt,
      })
      .from(evidenceTable)
      .innerJoin(documentsTable, eq(documentsTable.id, evidenceTable.documentId))
      .where(eq(evidenceTable.riskId, id))
      .orderBy(asc(evidenceTable.createdAt), asc(evidenceTable.id)),
    db
      .select()
      .from(mitigationActionsTable)
      .where(eq(mitigationActionsTable.riskId, id))
      .orderBy(asc(mitigationActionsTable.createdAt), asc(mitigationActionsTable.id)),
    db
      .select()
      .from(assessmentsTable)
      .where(eq(assessmentsTable.riskId, id))
      .orderBy(desc(assessmentsTable.createdAt), desc(assessmentsTable.id)),
    db.select(documentSummaryColumns).from(documentsTable).where(eq(documentsTable.id, risk.documentId)),
  ]);

  const currentAssessment = assessmentRows.find((a) => a.verdict === "identified");
  const evidence = allEvidence.filter((e) => e.assessmentId === null || e.assessmentId === currentAssessment?.id);
  const assessments = assessmentRows.map((a) => ({
    ...a,
    evidence: allEvidence.filter((e) => e.assessmentId === a.id),
  }));

  res.json(
    GetRiskResponse.parse({
      ...risk,
      sourceDocument: toDocumentSummary(sourceDocument!),
      evidence,
      actions,
      assessments,
    }),
  );
});

export default router;
