import { sql } from "drizzle-orm";
import { documentsTable, type DocumentRow } from "@workspace/db";

// Table-qualified on purpose: Drizzle renders columns unqualified in
// single-table selects, which would bind "id" to risks.id inside the subquery.
const riskCount = sql<number>`(
  select count(*)::int from risks r where r.document_id = "documents"."id"
)`;

/** Columns for the Document summary shape (everything except the text). */
export const documentSummaryColumns = {
  id: documentsTable.id,
  title: documentsTable.title,
  filename: documentsTable.filename,
  charCount: documentsTable.charCount,
  sourceType: documentsTable.sourceType,
  purpose: documentsTable.purpose,
  fileSize: documentsTable.fileSize,
  pageOffsets: documentsTable.pageOffsets,
  status: documentsTable.status,
  analysisError: documentsTable.analysisError,
  analysisModel: documentsTable.analysisModel,
  chunksTotal: documentsTable.chunksTotal,
  chunksDone: documentsTable.chunksDone,
  analysisStartedAt: documentsTable.analysisStartedAt,
  analyzedAt: documentsTable.analyzedAt,
  createdAt: documentsTable.createdAt,
  riskCount,
};

export function toDocumentSummary(row: Omit<DocumentRow, "content" | "contentHash"> & { riskCount: number }) {
  const { pageOffsets, ...rest } = row;
  return { ...rest, pageCount: pageOffsets ? pageOffsets.length : null };
}
