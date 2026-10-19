import { Router, type IRouter } from "express";
import { AskAssistantBody, AskAssistantResponse } from "@workspace/api-zod";
import { assistantRateLimit } from "../lib/rate-limit";
import { AiNotConfiguredError, MalformedAiOutputError, isAiConfigured } from "../lib/ai/client";
import { askAssistantModel, type ChatMessage } from "../lib/ai/assistant";
import { buildCompanySnapshot, finalizeReply } from "../lib/assistant";

const router: IRouter = Router();

// Earlier turns sent to the model, newest kept first, so long chats stay affordable.
export const MAX_HISTORY_CHARS = 16_000;

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (out.length > 0 && used + m.content.length > MAX_HISTORY_CHARS) break;
    out.unshift(m);
    used += m.content.length;
  }
  return out;
}

router.post("/assistant/chat", assistantRateLimit, async (req, res) => {
  const body = AskAssistantBody.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid conversation" });
    return;
  }
  const messages = body.data.messages.map((m) => ({ role: m.role, content: m.content.trim() }));
  const last = messages[messages.length - 1]!;
  if (last.role !== "user" || !last.content) {
    res.status(400).json({ error: "The last message must be a non-empty question from you." });
    return;
  }
  if (!isAiConfigured()) {
    res.status(503).json({ error: new AiNotConfiguredError().message });
    return;
  }

  const isCompany = req.user?.role === "company";
  const snapshot = await buildCompanySnapshot(isCompany);
  try {
    const ai = await askAssistantModel(snapshot, trimHistory(messages));
    const reply = finalizeReply(ai, snapshot);
    req.log.info(
      { topic: reply.topic, sources: reply.sources.length, turns: messages.length },
      "Assistant answered",
    );
    res.json(AskAssistantResponse.parse(reply));
  } catch (err) {
    req.log.warn({ err }, "Assistant failed");
    const message =
      err instanceof MalformedAiOutputError
        ? "The assistant returned an unusable answer. Please ask again."
        : "The assistant is not available right now. Please try again in a moment.";
    res.status(502).json({ error: message });
  }
});

export default router;
