import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, documentsTable, risksTable } from "@workspace/db";
import {
  CreateDocumentBody,
  CreateDocumentResponse,
  DeleteDocumentParams,
  GetDocumentParams,
  GetDocumentResponse,
  ListDocumentsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const riskCount = sql<number>`(
  select count(*)::int from ${risksTable} where ${risksTable.documentId} = ${documentsTable.id}
)`;

const summaryColumns = {
  id: documentsTable.id,
  title: documentsTable.title,
  filename: documentsTable.filename,
  charCount: documentsTable.charCount,
  status: documentsTable.status,
  createdAt: documentsTable.createdAt,
  riskCount,
};

router.get("/documents", async (_req, res) => {
  const rows = await db
    .select(summaryColumns)
    .from(documentsTable)
    .orderBy(desc(documentsTable.createdAt), desc(documentsTable.id));
  res.json(ListDocumentsResponse.parse(rows));
});

router.post("/documents", async (req, res) => {
  const parsed = CreateDocumentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { title, content, filename } = parsed.data;
  if (content.trim().length === 0) {
    res.status(400).json({ error: "Document text is empty" });
    return;
  }

  const [row] = await db
    .insert(documentsTable)
    .values({
      title: title.trim(),
      content,
      filename: filename ?? null,
      charCount: content.length,
    })
    .returning();

  req.log.info({ documentId: row!.id, charCount: row!.charCount }, "Document created");
  res.status(201).json(CreateDocumentResponse.parse({ ...row, riskCount: 0 }));
});

router.get("/documents/:id", async (req, res) => {
  const params = GetDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid document id" });
    return;
  }
  const [row] = await db
    .select({ ...summaryColumns, content: documentsTable.content })
    .from(documentsTable)
    .where(eq(documentsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  res.json(GetDocumentResponse.parse(row));
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
