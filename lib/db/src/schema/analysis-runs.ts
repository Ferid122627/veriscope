import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { documentsTable } from "./documents";

export const ANALYSIS_RUN_STATUSES = ["running", "completed", "failed"] as const;

// One row per AI analysis of a document. Kept after later runs so the
// history of what each run found is never overwritten.
export const analysisRunsTable = pgTable(
  "analysis_runs",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => documentsTable.id, { onDelete: "cascade" }),
    status: text("status", { enum: ANALYSIS_RUN_STATUSES }).notNull().default("running"),
    model: text("model").notNull(),
    chunksTotal: integer("chunks_total").notNull(),
    risksIdentified: integer("risks_identified"),
    risksNew: integer("risks_new"),
    risksMatched: integer("risks_matched"),
    risksNotDetected: integer("risks_not_detected"),
    // Title of the company rules document the run compared against, if any.
    playbookTitle: text("playbook_title"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("analysis_runs_document_id_idx").on(t.documentId)],
);

export type AnalysisRunRow = typeof analysisRunsTable.$inferSelect;
