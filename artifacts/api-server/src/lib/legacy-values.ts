import { eq } from "drizzle-orm";
import type { Logger } from "pino";
import { db, mitigationActionsTable, risksTable } from "@workspace/db";

/**
 * Convert status values from before Phase 4 so existing databases (including a
 * published one) match the current vocabulary. Safe to run on every start.
 * - Action "todo" -> "open"; "done" -> "submitted_for_review" (completion is not proof).
 * - Risk "resolved" -> "open": closing now requires a recorded human approval,
 *   which these rows do not have. (Earlier versions had no way to set it.)
 */
export async function migrateLegacyValues(log: Logger): Promise<void> {
  const todo = await db
    .update(mitigationActionsTable)
    .set({ status: "open" })
    .where(eq(mitigationActionsTable.status, "todo" as never))
    .returning({ id: mitigationActionsTable.id });
  const done = await db
    .update(mitigationActionsTable)
    .set({ status: "submitted_for_review" })
    .where(eq(mitigationActionsTable.status, "done" as never))
    .returning({ id: mitigationActionsTable.id });
  const resolved = await db
    .update(risksTable)
    .set({ status: "open" })
    .where(eq(risksTable.status, "resolved" as never))
    .returning({ id: risksTable.id });
  const total = todo.length + done.length + resolved.length;
  if (total) {
    log.warn(
      { actionsTodo: todo.length, actionsDone: done.length, risksResolved: resolved.map((r) => r.id) },
      "Converted legacy status values",
    );
  }
}
