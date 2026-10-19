import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { risksTable, RISK_SEVERITIES, RISK_LIKELIHOODS, EVIDENCE_BASES } from "./risks";
import { analysisRunsTable } from "./analysis-runs";

// initial: first time a risk is found; reanalysis: a later AI run over the same document;
// reassessment: judgement against new evidence.
export const ASSESSMENT_KINDS = ["initial", "reanalysis", "reassessment"] as const;
export const ASSESSMENT_VERDICTS = [
  "identified",
  "resolved",
  "partially_resolved",
  "not_resolved",
  "insufficient_evidence",
  // A re-run of the analysis did not find this risk again (it is kept, flagged for review).
  "not_detected",
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
    analysisRunId: integer("analysis_run_id").references(() => analysisRunsTable.id, { onDelete: "set null" }),
    // Snapshot of the AI's rating at the time, so changes across runs stay visible.
    severity: text("severity", { enum: RISK_SEVERITIES }),
    likelihood: text("likelihood", { enum: RISK_LIKELIHOODS }),
    evidenceBasis: text("evidence_basis", { enum: EVIDENCE_BASES }),
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
