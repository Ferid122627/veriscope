import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  documentsTable,
  risksTable,
  evidenceTable,
  mitigationActionsTable,
  assessmentsTable,
  reassessmentRequestsTable,
  riskStatusChangesTable,
} from "@workspace/db";
import { GetRiskParams, GetRiskResponse, ListRisksQueryParams, ListRisksResponse } from "@workspace/api-zod";
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
  riskKind: risksTable.riskKind,
  severityReason: risksTable.severityReason,
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
    where m.risk_id = "risks"."id" and m.status in ('open', 'in_progress')
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Everything the risk detail endpoint returns, read from one consistent snapshot.
 * Returns null when the risk does not exist.
 */
async function loadRiskDetail(tx: Tx, id: number) {
  const [risk] = await tx
    .select(riskColumns)
    .from(risksTable)
    .innerJoin(documentsTable, eq(documentsTable.id, risksTable.documentId))
    .where(eq(risksTable.id, id));
  if (!risk) return null;

  const allEvidence = await tx
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
    .orderBy(asc(evidenceTable.createdAt), asc(evidenceTable.id));
  const actionRows = await tx
    .select()
    .from(mitigationActionsTable)
    .where(eq(mitigationActionsTable.riskId, id))
    .orderBy(asc(mitigationActionsTable.createdAt), asc(mitigationActionsTable.id));
  const assessmentRows = await tx
    .select()
    .from(assessmentsTable)
    .where(eq(assessmentsTable.riskId, id))
    .orderBy(desc(assessmentsTable.createdAt), desc(assessmentsTable.id));
  const [sourceDocument] = await tx
    .select(documentSummaryColumns)
    .from(documentsTable)
    .where(eq(documentsTable.id, risk.documentId));
  const requestRows = await tx
    .select()
    .from(reassessmentRequestsTable)
    .where(eq(reassessmentRequestsTable.riskId, id))
    .orderBy(desc(reassessmentRequestsTable.createdAt), desc(reassessmentRequestsTable.id));
  const statusChanges = await tx
    .select()
    .from(riskStatusChangesTable)
    .where(eq(riskStatusChangesTable.riskId, id))
    .orderBy(desc(riskStatusChangesTable.createdAt), desc(riskStatusChangesTable.id));

  // Titles of every document referenced by actions, assessments and reassessment requests.
  const docIds = [
    ...new Set(
      [
        ...actionRows.map((a) => a.evidenceDocumentId),
        ...assessmentRows.map((a) => a.evidenceDocumentId),
        ...requestRows.map((r) => r.evidenceDocumentId),
      ].filter((v): v is number => v !== null),
    ),
  ];
  const titles = new Map(
    docIds.length
      ? (
          await tx
            .select({ id: documentsTable.id, title: documentsTable.title })
            .from(documentsTable)
            .where(inArray(documentsTable.id, docIds))
        ).map((d) => [d.id, d.title])
      : [],
  );
  const titleOf = (docId: number | null) => (docId === null ? null : (titles.get(docId) ?? null));
  const actions = actionRows.map((a) => ({ ...a, evidenceDocumentTitle: titleOf(a.evidenceDocumentId) }));
  const reassessmentRequests = requestRows.map((r) => ({
    ...r,
    evidenceDocumentTitle: titleOf(r.evidenceDocumentId) ?? "(deleted document)",
  }));

  const currentAssessment = assessmentRows.find((a) => a.verdict === "identified");
  const evidence = allEvidence.filter((e) => e.assessmentId === null || e.assessmentId === currentAssessment?.id);
  const assessments = assessmentRows.map((a) => ({
    ...a,
    evidenceDocumentTitle: titleOf(a.evidenceDocumentId),
    evidence: allEvidence.filter((e) => e.assessmentId === a.id),
  }));

  return {
    ...risk,
    sourceDocument: toDocumentSummary(sourceDocument!),
    evidence,
    actions,
    assessments,
    reassessmentRequests,
    statusChanges,
  };
}

router.get("/risks/:id", async (req, res) => {
  const params = GetRiskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid risk id" });
    return;
  }

  // One REPEATABLE READ, read-only transaction: every section below sees the same
  // committed snapshot, so a reassessment that commits mid-request is either fully
  // visible (request, assessment, evidence) or not visible at all.
  const detail = await db.transaction((tx) => loadRiskDetail(tx, params.data.id), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
  if (!detail) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  res.json(GetRiskResponse.parse(detail));
});

export default router;
