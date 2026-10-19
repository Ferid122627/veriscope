import { pgTable, text, serial, timestamp, integer, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { risksTable } from "./risks";
import { assessmentsTable } from "./assessments";

// A quote from a source document. `verified` is true only when the quote was
// located verbatim in the document's stored text; offsets point at that match.
export const EVIDENCE_MATCH_TYPES = ["exact", "normalized", "not_found"] as const;

export const evidenceTable = pgTable(
  "evidence",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    // Set when the evidence was cited by a reassessment rather than the initial analysis.
    assessmentId: integer("assessment_id").references(() => assessmentsTable.id, {
      onDelete: "cascade",
    }),
    // Source text when located (exact characters from the document); otherwise the AI's claim.
    quote: text("quote").notNull(),
    // The quotation exactly as the AI returned it, kept for audit.
    claimedQuote: text("claimed_quote"),
    matchType: text("match_type", { enum: EVIDENCE_MATCH_TYPES }).notNull().default("not_found"),
    // Which normalizations were needed to locate a "normalized" match.
    normalizations: jsonb("normalizations").$type<string[]>().notNull().default([]),
    // How many places in the document the quotation matches (>1 = ambiguous location).
    matchCount: integer("match_count").notNull().default(0),
    startOffset: integer("start_offset"),
    endOffset: integer("end_offset"),
    verified: boolean("verified").notNull(),
    // 1-based page in the source PDF, derived from startOffset; null if unknown.
    pageNumber: integer("page_number"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evidence_risk_id_idx").on(t.riskId)],
);

export const insertEvidenceSchema = createInsertSchema(evidenceTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type EvidenceRow = typeof evidenceTable.$inferSelect;
