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

const router: IRouter = Router();

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
  status: risksTable.status,
  createdAt: risksTable.createdAt,
  updatedAt: risksTable.updatedAt,
  // Table-qualified so the correlation never binds to the subquery's own table.
  evidenceCount: sql<number>`(
    select count(*)::int from evidence e where e.risk_id = "risks"."id"
  )`,
  openActionCount: sql<number>`(
    select count(*)::int from mitigation_actions m
    where m.risk_id = "risks"."id" and m.status <> 'done'
  )`,
};

const severityRank = sql`case ${risksTable.severity}
  when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`;

router.get("/risks", async (req, res) => {
  const query = ListRisksQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.issues[0]?.message ?? "Invalid filters" });
    return;
  }
  const { severity, status, documentId } = query.data;
  const filters: SQL[] = [];
  if (severity) filters.push(eq(risksTable.severity, severity));
  if (status) filters.push(eq(risksTable.status, status));
  if (documentId !== undefined) filters.push(eq(risksTable.documentId, documentId));

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

  const [evidence, actions, assessments] = await Promise.all([
    db
      .select({
        id: evidenceTable.id,
        riskId: evidenceTable.riskId,
        documentId: evidenceTable.documentId,
        documentTitle: documentsTable.title,
        quote: evidenceTable.quote,
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
  ]);

  res.json(GetRiskResponse.parse({ ...risk, evidence, actions, assessments }));
});

export default router;
