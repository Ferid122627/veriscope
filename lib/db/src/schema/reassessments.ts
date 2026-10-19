import { pgTable, text, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { risksTable, RISK_STATUSES } from "./risks";
import { documentsTable } from "./documents";
import { mitigationActionsTable } from "./mitigation-actions";
import { assessmentsTable } from "./assessments";

export const REASSESSMENT_REQUEST_STATUSES = ["pending", "completed", "failed"] as const;

// A request to reassess a risk against new evidence. Runs in the background;
// the result is an assessment row. At most one pending request per risk.
export const reassessmentRequestsTable = pgTable(
  "reassessment_requests",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    actionId: integer("action_id").references(() => mitigationActionsTable.id, { onDelete: "set null" }),
    evidenceDocumentId: integer("evidence_document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: REASSESSMENT_REQUEST_STATUSES }).notNull().default("pending"),
    error: text("error"),
    assessmentId: integer("assessment_id").references(() => assessmentsTable.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("reassessment_requests_risk_id_idx").on(t.riskId),
    uniqueIndex("reassessment_requests_one_pending_per_risk")
      .on(t.riskId)
      .where(sql`status = 'pending'`),
  ],
);

// Every change of a risk's status, with who made it and why. Never updated or deleted.
export const riskStatusChangesTable = pgTable(
  "risk_status_changes",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status", { enum: RISK_STATUSES }).notNull(),
    toStatus: text("to_status", { enum: RISK_STATUSES }).notNull(),
    changedBy: text("changed_by").notNull(),
    note: text("note"),
    // The reassessment the decision was based on, if any.
    assessmentId: integer("assessment_id").references(() => assessmentsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_status_changes_risk_id_idx").on(t.riskId)],
);
