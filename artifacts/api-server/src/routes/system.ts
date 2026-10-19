import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { GetSystemStatusResponse } from "@workspace/api-zod";

const router: IRouter = Router();

// AI provider credentials are injected by Replit AI Integrations as env vars.
// We only report whether they are present — never their values.
function aiProviderConfigured(): boolean {
  return Boolean(
    (process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] &&
      process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"]) ||
      (process.env["AI_INTEGRATIONS_OPENAI_API_KEY"] &&
        process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"]),
  );
}

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
    aiProvider: aiProviderConfigured() ? "configured" : "not_configured",
    checkedAt: new Date(),
  });
  res.json(data);
});

export default router;
