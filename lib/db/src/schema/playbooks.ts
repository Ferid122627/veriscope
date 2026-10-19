import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { DOCUMENT_SOURCES } from "./documents";

// The company's own rules (the "playbook"). There is at most one: uploading a
// new rules document replaces the previous one. Risks keep a copy of the rule
// text they cite, so replacing or removing the playbook never changes history.
export const playbooksTable = pgTable("playbooks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  filename: text("filename"),
  sourceType: text("source_type", { enum: DOCUMENT_SOURCES }).notNull(),
  fileSize: integer("file_size"),
  // Extracted plain text; rule quotes are verified against this exact string.
  content: text("content").notNull(),
  charCount: integer("char_count").notNull(),
  pageOffsets: jsonb("page_offsets").$type<number[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlaybookRow = typeof playbooksTable.$inferSelect;
