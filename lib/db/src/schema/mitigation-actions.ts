import { pgTable, text, serial, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { risksTable } from "./risks";

// There is deliberately no "done": finishing an action only submits it for review.
// Whether the risk is actually resolved is decided by reassessment + human approval.
export const ACTION_STATUSES = ["open", "in_progress", "submitted_for_review"] as const;

export const mitigationActionsTable = pgTable(
  "mitigation_actions",
  {
    id: serial("id").primaryKey(),
    riskId: integer("risk_id")
      .notNull()
      .references(() => risksTable.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    owner: text("owner"),
    dueDate: date("due_date", { mode: "string" }),
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("open"),
    // Supporting evidence the owner provides: a note and/or a linked document.
    evidenceNote: text("evidence_note"),
    evidenceDocumentId: integer("evidence_document_id").references(() => documentsTable.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mitigation_actions_risk_id_idx").on(t.riskId)],
);

export const insertMitigationActionSchema = createInsertSchema(mitigationActionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMitigationAction = z.infer<typeof insertMitigationActionSchema>;
export type MitigationActionRow = typeof mitigationActionsTable.$inferSelect;
