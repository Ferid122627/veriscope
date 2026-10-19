import { desc } from "drizzle-orm";
import { db, playbooksTable, type PlaybookRow } from "@workspace/db";

// The rules are sent to the AI with every section of every document checked,
// so they must stay short enough to fit alongside the document text.
export const MAX_PLAYBOOK_CHARS = 40_000;

/** The current company rules document, or null when none has been uploaded. */
export async function getCurrentPlaybook(): Promise<PlaybookRow | null> {
  const [row] = await db
    .select()
    .from(playbooksTable)
    .orderBy(desc(playbooksTable.createdAt), desc(playbooksTable.id))
    .limit(1);
  return row ?? null;
}
