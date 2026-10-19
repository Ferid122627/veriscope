import { pgTable, text, serial, timestamp, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const DOCUMENT_STATUSES = ["uploaded", "analyzing", "analyzed", "failed"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_SOURCES = ["text", "pdf", "docx"] as const;

export const documentsTable = pgTable(
  "documents",
  {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename"),
  // Extracted plain text. Evidence offsets index into this exact string,
  // so it must never be rewritten after creation.
  content: text("content").notNull(),
  charCount: integer("char_count").notNull(),
  // sha256 of `content`; used to stop the same text being added twice.
  contentHash: text("content_hash").notNull(),
  sourceType: text("source_type", { enum: DOCUMENT_SOURCES }).notNull().default("text"),
  fileSize: integer("file_size"),
  // For PDFs: character offset in `content` where each page starts (index 0 = page 1).
  pageOffsets: jsonb("page_offsets").$type<number[]>(),
  status: text("status", { enum: DOCUMENT_STATUSES }).notNull().default("uploaded"),
  analysisError: text("analysis_error"),
  analysisModel: text("analysis_model"),
  chunksTotal: integer("chunks_total"),
  chunksDone: integer("chunks_done"),
  analysisStartedAt: timestamp("analysis_started_at", { withTimezone: true }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("documents_content_hash_idx").on(t.contentHash)],
);

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentRow = typeof documentsTable.$inferSelect;
