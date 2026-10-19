import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, documentsTable, type DocumentRow } from "@workspace/db";
import type { ExtractedDocument } from "./text-extraction";

export function hashContent(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type InsertOutcome = { created: DocumentRow } | { duplicateOf: number };

/** Insert unless identical text already exists (enforced by a unique index). */
export async function insertDocument(input: {
  title: string;
  filename: string | null;
  fileSize: number | null;
  extracted: ExtractedDocument;
  purpose?: "analysis" | "evidence";
}): Promise<InsertOutcome> {
  const contentHash = hashContent(input.extracted.text);
  const [row] = await db
    .insert(documentsTable)
    .values({
      title: input.title,
      filename: input.filename,
      fileSize: input.fileSize,
      content: input.extracted.text,
      charCount: input.extracted.text.length,
      contentHash,
      sourceType: input.extracted.sourceType,
      pageOffsets: input.extracted.pageOffsets,
      purpose: input.purpose ?? "analysis",
    })
    .onConflictDoNothing({ target: documentsTable.contentHash })
    .returning();
  if (row) return { created: row };

  const [existing] = await db
    .select({ id: documentsTable.id })
    .from(documentsTable)
    .where(eq(documentsTable.contentHash, contentHash));
  return { duplicateOf: existing!.id };
}
