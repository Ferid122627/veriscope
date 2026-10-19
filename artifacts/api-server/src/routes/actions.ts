import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, documentsTable, mitigationActionsTable, risksTable, type MitigationActionRow } from "@workspace/db";
import {
  CreateActionBody,
  CreateActionParams,
  CreateActionResponse,
  DeleteActionParams,
  UpdateActionBody,
  UpdateActionParams,
  UpdateActionResponse,
} from "@workspace/api-zod";

// Actions are the owner's work on a risk. No route here ever changes the risk's
// status: submitting an action for review is not evidence that the risk is gone.
const router: IRouter = Router();

/** null for blank strings, so "" from a cleared form field is stored as "not set". */
function blankToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined || v === null) return v;
  const t = v.trim();
  return t === "" ? null : t;
}

function invalidDueDate(v: string | null | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return true;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v;
}

async function documentExists(id: number): Promise<boolean> {
  const [row] = await db.select({ id: documentsTable.id }).from(documentsTable).where(eq(documentsTable.id, id));
  return !!row;
}

async function withDocumentTitle(row: MitigationActionRow) {
  let evidenceDocumentTitle: string | null = null;
  if (row.evidenceDocumentId !== null) {
    const [doc] = await db
      .select({ title: documentsTable.title })
      .from(documentsTable)
      .where(eq(documentsTable.id, row.evidenceDocumentId));
    evidenceDocumentTitle = doc?.title ?? null;
  }
  return { ...row, evidenceDocumentTitle };
}

router.post("/risks/:id/actions", async (req, res) => {
  const params = CreateActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid risk id" });
    return;
  }
  const body = CreateActionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const input = body.data;
  if (invalidDueDate(input.dueDate)) {
    res.status(400).json({ error: "Due date must be a valid date in YYYY-MM-DD format." });
    return;
  }
  const [risk] = await db.select({ id: risksTable.id }).from(risksTable).where(eq(risksTable.id, params.data.id));
  if (!risk) {
    res.status(404).json({ error: "Risk not found" });
    return;
  }
  if (input.evidenceDocumentId != null && !(await documentExists(input.evidenceDocumentId))) {
    res.status(400).json({ error: "The linked evidence document does not exist." });
    return;
  }
  const [row] = await db
    .insert(mitigationActionsTable)
    .values({
      riskId: risk.id,
      description: input.description.trim(),
      owner: blankToNull(input.owner) ?? null,
      dueDate: input.dueDate ?? null,
      status: input.status ?? "open",
      evidenceNote: blankToNull(input.evidenceNote) ?? null,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
    })
    .returning();
  req.log.info({ actionId: row!.id, riskId: risk.id }, "Mitigation action created");
  res.status(201).json(CreateActionResponse.parse(await withDocumentTitle(row!)));
});

router.patch("/actions/:id", async (req, res) => {
  const params = UpdateActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }
  const body = UpdateActionBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const input = body.data;
  if (invalidDueDate(input.dueDate)) {
    res.status(400).json({ error: "Due date must be a valid date in YYYY-MM-DD format." });
    return;
  }
  if (input.evidenceDocumentId != null && !(await documentExists(input.evidenceDocumentId))) {
    res.status(400).json({ error: "The linked evidence document does not exist." });
    return;
  }
  const changes = {
    ...(input.description !== undefined && { description: input.description.trim() }),
    ...(input.owner !== undefined && { owner: blankToNull(input.owner) ?? null }),
    ...(input.dueDate !== undefined && { dueDate: input.dueDate }),
    ...(input.status !== undefined && { status: input.status }),
    ...(input.evidenceNote !== undefined && { evidenceNote: blankToNull(input.evidenceNote) ?? null }),
    ...(input.evidenceDocumentId !== undefined && { evidenceDocumentId: input.evidenceDocumentId }),
  };
  const [row] = await db
    .update(mitigationActionsTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(mitigationActionsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  req.log.info({ actionId: row.id, fields: Object.keys(changes) }, "Mitigation action updated");
  res.json(UpdateActionResponse.parse(await withDocumentTitle(row)));
});

router.delete("/actions/:id", async (req, res) => {
  const params = DeleteActionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid action id" });
    return;
  }
  const [row] = await db
    .delete(mitigationActionsTable)
    .where(eq(mitigationActionsTable.id, params.data.id))
    .returning({ id: mitigationActionsTable.id });
  if (!row) {
    res.status(404).json({ error: "Action not found" });
    return;
  }
  res.status(204).end();
});

export default router;
