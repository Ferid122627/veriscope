import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { documentsTable } from "./documents";

export const RISK_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const RISK_STATUSES = ["open", "mitigating", "resolved"] as const;
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
