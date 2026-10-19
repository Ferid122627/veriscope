import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, documentsTable, risksTable, analysisRunsTable, type DocumentRow } from "@workspace/db";
import {
  AnalyzeDocumentBody,
  AnalyzeDocumentParams,
  AnalyzeDocumentResponse,
  CreateDocumentBody,
  CreateDocumentResponse,
  DeleteDocumentParams,
  GetDocumentParams,
  GetDocumentReportParams,
  GetDocumentResponse,
  ListDocumentsResponse,
  UploadDocumentResponse,
} from "@workspace/api-zod";
import {
  ExtractionError,
  assertTextWithinLimits,
  extractFromUpload,
  type ExtractedDocument,
} from "../lib/text-extraction";
import { startAnalysis } from "../lib/analysis-runner";
import { documentSummaryColumns, toDocumentSummary } from "../lib/document-summary";
import { insertDocument } from "../lib/document-store";
import { receiveFile, uploadedFilename } from "../lib/upload";
import { aiRateLimit } from "../lib/rate-limit";
import { loadRiskDetail } from "./risks";
import { buildDocumentReport } from "../lib/report-pdf";
import { computeCompliance } from "../lib/compliance-score";

const router: IRouter = Router();

const toSummary = toDocumentSummary;
const selectSummary = documentSummaryColumns;

function toDetail(row: DocumentRow & { riskCount: number }) {
  const { content, contentHash: _hash, ...summary } = row;
  return { ...toSummary(summary), content, pageOffsets: row.pageOffsets ?? null, analysisRuns: [], compliance: null };
}

router.get("/documents", async (_req, res) => {
  const rows = await db
    .select(selectSummary)
    .from(documentsTable)
    .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id));
  res.json(ListDocumentsResponse.parse(rows.map(toSummary)));
});

router.post("/documents", async (req, res) => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { title, content, filename } = parsed.data;
  const text = content.replace(/\r\n?/g, "\n");
  try {
    assertTextWithinLimits(text);
  } catch (err) {
    if (err instanceof ExtractionError) {
      res.status(err.status === 422 ? 400 : err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  const outcome = await insertDocument({
    title: title.trim(),
    filename: filename ?? null,
    fileSize: null,
    extracted: { text, sourceType: "text", pageOffsets: null },
  });
  if ("duplicateOf" in outcome) {
    res.status(409).json({
      error: "A document with exactly the same text already exists.",
      existingDocumentId: outcome.duplicateOf,
    });
    return;
  }
  req.log.info({ documentId: outcome.created.id, charCount: outcome.created.charCount }, "Document created");
  res.status(201).json(CreateDocumentResponse.parse(toDetail({ ...outcome.created, riskCount: 0 })));
});

router.post("/documents/upload", receiveFile, async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file received. Send the document in the "file" field.' });
    return;
  }
  // Browsers send UTF-8 filenames; multer decodes them as latin1.
  const filename = uploadedFilename(file);
  const rawTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (rawTitle.length > 200) {
    res.status(400).json({ error: "Title must be 200 characters or fewer." });
    return;
  }
  const title = (rawTitle || filename.replace(/\.[^.]+$/, "") || filename).slice(0, 200);

  let extracted: ExtractedDocument;
  try {
    extracted = await extractFromUpload(file.buffer, filename);
  } catch (err) {
    if (err instanceof ExtractionError) {
      req.log.warn({ filename, size: file.size, status: err.status }, "Upload rejected: %s", err.message);
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }

  const outcome = await insertDocument({ title, filename, fileSize: file.size, extracted });
  if ("duplicateOf" in outcome) {
    res.status(409).json({
      error: "This document's text is identical to a document that already exists.",
      existingDocumentId: outcome.duplicateOf,
    });
    return;
  }
  req.log.info(
    {
      documentId: outcome.created.id,
      sourceType: extracted.sourceType,
      pages: extracted.pageOffsets?.length ?? null,
      charCount: outcome.created.charCount,
    },
    "Document uploaded",
  );
  res.status(201).json(UploadDocumentResponse.parse(toDetail({ ...outcome.created, riskCount: 0 })));
});

router.post("/documents/:id/analyze", aiRateLimit, async (req, res) => {
  const params = AnalyzeDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const body = AnalyzeDocumentBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const result = await startAnalysis(params.data.id, body.data.rerun ?? false, req.log);
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(risksTable)
    .where(eq(risksTable.documentId, params.data.id));
  const { content: _c, contentHash: _h, ...summary } = result.document;
  res.status(202).json(AnalyzeDocumentResponse.parse(toSummary({ ...summary, riskCount: count!.n })));
});

router.get("/documents/:id/report.pdf", async (req, res) => {
  const params = GetDocumentReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const id = params.data.id;
  // One consistent snapshot so the report never mixes two analysis runs.
  const data = await db.transaction(
    async (tx) => {
      const [doc] = await tx.select(selectSummary).from(documentsTable).where(eq(documentsTable.id, id));
      if (!doc) return null;
      const ids = await tx
        .select({ id: risksTable.id })
        .from(risksTable)
        .where(eq(risksTable.documentId, id))
        .orderBy(
          sql`case ${risksTable.severity} when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end`,
          desc(risksTable.updatedAt),
          desc(risksTable.id),
        );
      const risks = [];
      for (const r of ids) {
        const detail = await loadRiskDetail(tx, r.id);
        if (detail) risks.push(detail);
      }
      return { doc: toSummary(doc), risks, compliance: doc.analyzedAt ? computeCompliance(risks) : null };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  if (!data) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const pdf = await buildDocumentReport(data.doc, data.risks, data.compliance);
  const base = data.doc.title.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "document";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="veriscope-report-${base}.pdf"`);
  res.setHeader("Cache-Control", "no-store");
  res.send(pdf);
});

router.get("/documents/:id", async (req, res) => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const [row] = await db
    .select({ ...selectSummary, content: documentsTable.content })
    .from(documentsTable)
    .where(eq(documentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  const analysisRuns = await db
    .select()
    .from(analysisRunsTable)
    .where(eq(analysisRunsTable.documentId, row.id))
    .orderBy(desc(analysisRunsTable.startedAt), desc(analysisRunsTable.id));
  // Breakdown and score come from the same rows, so they always agree.
  const compliance = row.analyzedAt
    ? computeCompliance(
        await db
          .select({ severity: risksTable.severity, status: risksTable.status, evidenceStatus: risksTable.evidenceStatus })
          .from(risksTable)
          .where(eq(risksTable.documentId, row.id)),
      )
    : null;
  const { content, ...summary } = row;
  res.json(
    GetDocumentResponse.parse({
      ...toSummary({ ...summary, complianceScore: compliance?.score ?? null }),
      content,
      pageOffsets: row.pageOffsets ?? null,
      analysisRuns,
      compliance,
    }),
  );
});

router.delete("/documents/:id", async (req, res) => {
  const params = DeleteDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const deleted = await db
    .delete(documentsTable)
    .where(eq(documentsTable.id, params.data.id))
    .returning({ id: documentsTable.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  req.log.info({ documentId: params.data.id }, "Document deleted");
  res.status(204).end();
});

export default router;
