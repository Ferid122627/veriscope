import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetSystemStatusResponse } from "@workspace/api-zod";
import { isAiConfigured } from "../lib/ai/client";

const router: IRouter = Router();

router.get("/system/status", async (req, res) => {
  let database: "ok" | "error" = "ok";
  try {
    await db.execute(sql`select 1`);
  } catch (err) {
    req.log.error({ err }, "Database health probe failed");
    database = "error";
  }

  const data = GetSystemStatusResponse.parse({
    api: "ok",
    database,
    aiProvider: isAiConfigured() ? "configured" : "not_configured",
    checkedAt: new Date(),
  });
  res.json(data);
});

export default router;
