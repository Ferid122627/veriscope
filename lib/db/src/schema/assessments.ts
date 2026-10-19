import { pgTable, text, serial, timestamp, integer, real, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";
import { risksTable, RISK_SEVERITIES, RISK_LIKELIHOODS, EVIDENCE_BASES } from "./risks";
import { analysisRunsTable } from "./analysis-runs";
import { mitigationActionsTable } from "./mitigation-actions";

// initial: first time a risk is found; reanalysis: a later AI run over the same document;
// reassessment: judgement against new evidence.
export const ASSESSMENT_KINDS = ["initial", "reanalysis", "reassessment"] as const;
export const ASSESSMENT_VERDICTS = [
  // From document analysis:
  "identified",
  // A re-run of the analysis did not find this risk again (it is kept, flagged for review).
  "not_detected",
  // Reassessment outcomes (AI recommendations, never applied to the risk automatically):
  "resolved",
  "partially_resolved",
  "unresolved",
  "needs_human_review",
] as const;
export const REASSESSMENT_OUTCOMES = ["resolved", "partially_resolved", "unresolved", "needs_human_review"] as const;
export type ReassessmentOutcome = (typeof REASSESSMENT_OUTCOMES)[number];

// What kind of proof the new evidence is. Only "operating_evidence" can support resolution.
export const EVIDENCE_TYPES = ["operating_evidence", "policy_or_design", "plan_or_promise", "unrelated", "mixed"] as const;

// A human's decision on an AI recommendation. Recorded separately from the AI's output.
export const HUMAN_DECISIONS = ["accepted", "rejected"] as const;

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
    // Reassessment only.
    actionId: integer("action_id").references(() => mitigationActionsTable.id, { onDelete: "set null" }),
    aiVerdict: text("ai_verdict", { enum: REASSESSMENT_OUTCOMES }), // what the AI said before server rules
    evidenceType: text("evidence_type", { enum: EVIDENCE_TYPES }),
    requirementsMet: jsonb("requirements_met").$type<string[]>(),
    remainingGaps: jsonb("remaining_gaps").$type<string[]>(),
    nextSteps: jsonb("next_steps").$type<string[]>(),
    // Why the server changed the AI's outcome (empty when unchanged).
    guardrailNotes: jsonb("guardrail_notes").$type<string[]>(),
    decision: text("decision", { enum: HUMAN_DECISIONS }),
    decidedBy: text("decided_by"),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
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
