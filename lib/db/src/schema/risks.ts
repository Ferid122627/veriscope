import { pgTable, text, serial, timestamp, integer, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

export const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const RISK_STATUSES = ["open", "mitigating", "resolved"] as const;
export const RISK_LIKELIHOODS = ["low", "medium", "high"] as const;
// How the finding is supported: a direct quotation, an interpretation of
// several passages, or nothing quotable.
export const EVIDENCE_BASES = ["direct", "inferred", "none"] as const;
// Computed by the server from verification results, never by the AI.
export const EVIDENCE_STATUSES = ["verified", "partially_verified", "unverified", "no_evidence"] as const;
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
