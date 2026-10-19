import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, playbooksTable, type PlaybookRow } from "@workspace/db";
import { GetPlaybookResponse, UploadPlaybookResponse } from "@workspace/api-zod";
import { ExtractionError, extractFromUpload, type ExtractedDocument } from "../lib/text-extraction";
import { receiveFile, uploadedFilename } from "../lib/upload";
import { MAX_PLAYBOOK_CHARS, getCurrentPlaybook } from "../lib/playbook";

const router: IRouter = Router();

function toPlaybook(row: PlaybookRow) {
  const { pageOffsets, ...rest } = row;
  return { ...rest, pageCount: pageOffsets ? pageOffsets.length : null };
}

router.get("/playbook", async (_req, res) => {
  const row = await getCurrentPlaybook();
  res.json(GetPlaybookResponse.parse({ playbook: row ? toPlaybook(row) : null }));
});

router.post("/playbook", receiveFile, async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file received. Send the rules document in the "file" field.' });
    return;
  }
  const filename = uploadedFilename(file);
  const rawTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (rawTitle.length > 200) {
    res.status(400).json({ error: "Title must be 200 characters or fewer." });
    return;
  }
  const title = (rawTitle || filename.replace(/\.[^.]+$/, "") || filename).slice(0, 200);

  let extracted: ExtractedDocument;
  try {
    extracted = await extractFromUpload(file.buffer, filename);
  } catch (err) {
    if (err instanceof ExtractionError) {
      req.log.warn({ filename, size: file.size, status: err.status }, "Playbook upload rejected: %s", err.message);
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
  if (extracted.text.length > MAX_PLAYBOOK_CHARS) {
    res.status(413).json({
      error: `The rules document has ${extracted.text.length.toLocaleString("en-GB")} characters. The limit is ${MAX_PLAYBOOK_CHARS.toLocaleString("en-GB")}, because the rules are sent to the AI with every document. Keep only the rules themselves.`,
    });
    return;
  }

  // Replace, never keep two: there is one set of company rules at a time.
  const row = await db.transaction(async (tx) => {
    // Serialise concurrent uploads so they cannot leave two rule sets behind.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('veriscope-playbook'))`);
    await tx.delete(playbooksTable);
    const [created] = await tx
      .insert(playbooksTable)
      .values({
        title,
        filename,
        sourceType: extracted.sourceType,
        fileSize: file.size,
        content: extracted.text,
        charCount: extracted.text.length,
        pageOffsets: extracted.pageOffsets,
      })
      .returning();
    return created!;
  });
  req.log.info({ playbookId: row.id, charCount: row.charCount, sourceType: row.sourceType }, "Playbook uploaded");
  res.status(201).json(UploadPlaybookResponse.parse(toPlaybook(row)));
});

router.delete("/playbook", async (req, res) => {
  const deleted = await db.delete(playbooksTable).returning({ id: playbooksTable.id });
  if (!deleted.length) {
    res.status(404).json({ error: "No company rules have been uploaded." });
    return;
  }
  req.log.info({ playbookIds: deleted.map((d) => d.id) }, "Playbook removed");
  res.status(204).end();
});

export default router;
