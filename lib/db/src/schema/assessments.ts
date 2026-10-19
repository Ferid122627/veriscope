import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { risksTable } from "./risks";

export const ASSESSMENT_KINDS = ["initial", "reassessment"] as const;
export const ASSESSMENT_VERDICTS = [
  "identified",
  "resolved",
  "partially_resolved",
  "not_resolved",
  "insufficient_evidence",
] as const;

// Append-only history: one row per AI judgement on a risk.
export const assessmentsTable = pgTable(
  "assessments",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ASSESSMENT_KINDS }).notNull(),
    verdict: text("verdict", { enum: ASSESSMENT_VERDICTS }).notNull(),
    rationale: text("rationale").notNull(),
    confidence: real("confidence"),
    evidenceDocumentId: integer("evidence_document_id").references(() => documentsTable.id, {
      onDelete: "set null",
    }),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assessments_risk_id_idx").on(t.riskId)],
);

export const insertAssessmentSchema = createInsertSchema(assessmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAssessment = z.infer<typeof insertAssessmentSchema>;
export type AssessmentRow = typeof assessmentsTable.$inferSelect;
