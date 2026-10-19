import { pgTable, text, serial, timestamp, integer, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { risksTable } from "./risks";

export const ACTION_STATUSES = ["todo", "in_progress", "done"] as const;

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
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("todo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("mitigation_actions_risk_id_idx").on(t.riskId)],
);

export const insertMitigationActionSchema = createInsertSchema(mitigationActionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMitigationAction = z.infer<typeof insertMitigationActionSchema>;
export type MitigationActionRow = typeof mitigationActionsTable.$inferSelect;
