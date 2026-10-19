import { pgTable, text, serial, timestamp, integer, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

export const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
// "closed" can only be set through an explicit, recorded human approval.
export const RISK_STATUSES = ["open", "mitigating", "closed"] as const;
export const RISK_LIKELIHOODS = ["low", "medium", "high"] as const;
// How the finding is supported: a direct quotation, an interpretation of
// several passages, or nothing quotable.
export const EVIDENCE_BASES = ["direct", "inferred", "none"] as const;
// Computed by the server from verification results, never by the AI.
export const EVIDENCE_STATUSES = ["verified", "partially_verified", "unverified", "no_evidence"] as const;
// What kind of finding this is: a protection the document lacks, a possible
// future problem, or something the text shows is already wrong.
export const RISK_KINDS = ["missing_protection", "potential_risk", "actual_issue"] as const;
export type RiskKind = (typeof RISK_KINDS)[number];
// Standards a finding can be related to. "Related" means where a specialist
// should look, never a finding that the document breaks the standard.
export const REGULATION_FRAMEWORKS = ["GDPR", "ISO 27001", "ISO 9001", "SOC 2", "HIPAA", "NIST", "Local law", "Azerbaijan law"] as const;
export type RegulationFramework = (typeof REGULATION_FRAMEWORKS)[number];
export interface RegulationRef {
  framework: RegulationFramework;
  reference: string;
}
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];
export type RiskStatus = (typeof RISK_STATUSES)[number];

export const risksTable = pgTable(
  "risks",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    severity: text("severity", { enum: RISK_SEVERITIES }).notNull(),
    likelihood: text("likelihood", { enum: RISK_LIKELIHOODS }),
    // Nullable so risks recorded before severity calibration stay valid.
    riskKind: text("risk_kind", { enum: RISK_KINDS }),
    severityReason: text("severity_reason"),
    businessImpact: text("business_impact"),
    // Uncertainty or points a human reviewer should check.
    reviewNotes: text("review_notes"),
    recommendedMitigation: text("recommended_mitigation"),
    evidenceBasis: text("evidence_basis", { enum: EVIDENCE_BASES }),
    // Why the risk is an interpretation rather than a direct quotation.
    interpretationNote: text("interpretation_note"),
    evidenceStatus: text("evidence_status", { enum: EVIDENCE_STATUSES }).notNull().default("no_evidence"),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),
    regulations: jsonb("regulations").$type<RegulationRef[]>().notNull().default([]),
    // Company rule (from the playbook) this finding conflicts with or that
    // requires a missing clause. A copy, so later playbook changes do not alter it.
    playbookTitle: text("playbook_title"),
    playbookRuleQuote: text("playbook_rule_quote"),
    // Whether the quoted rule was found word for word in the playbook text.
    playbookRuleVerified: boolean("playbook_rule_verified"),
    playbookGap: text("playbook_gap"),
    // AI-drafted replacement or new clause; a draft for a lawyer to review.
    suggestedClause: text("suggested_clause"),
    suggestedClauseTarget: text("suggested_clause_target"),
    lastAnalysisRunId: integer("last_analysis_run_id"),
    status: text("status", { enum: RISK_STATUSES }).notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("risks_document_id_idx").on(t.documentId)],
);

export const insertRiskSchema = createInsertSchema(risksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRisk = z.infer<typeof insertRiskSchema>;
export type RiskRow = typeof risksTable.$inferSelect;
