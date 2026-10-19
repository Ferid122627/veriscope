import OpenAI from "openai";

// Credentials come from Replit AI Integrations env vars and stay server-side.
// The client is created lazily so a missing credential surfaces as a clear
// request error instead of crashing the server at startup.

export const ANALYSIS_MODEL = "gpt-5.6-terra";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("The AI provider is not configured on the server, so documents cannot be analyzed.");
    this.name = "AiNotConfiguredError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(
    process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"] && process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
  );
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  client ??= new OpenAI({
    baseURL: process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"],
    apiKey: process.env["AI_INTEGRATIONS_OPENAI_API_KEY"],
    timeout: 180_000,
    maxRetries: 0, // retries are handled by the caller with backoff
  });
  return client;
}

export interface StructuredRequest {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}

/** Returns the raw text the model produced; the caller parses and validates it. */
export async function requestStructuredCompletion(req: StructuredRequest): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: ANALYSIS_MODEL,
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: req.schemaName, strict: true, schema: req.jsonSchema },
    },
  });
  const choice = response.choices[0];
  if (choice?.message?.refusal) {
    throw new Error(`The AI provider refused the request: ${choice.message.refusal}`);
  }
  if (choice?.finish_reason === "length") {
    throw new MalformedAiOutputError("The AI response was cut off before it finished.");
  }
  return choice?.message?.content ?? "";
}

export class MalformedAiOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedAiOutputError";
  }
}

/** Status-bearing errors from the provider that are worth retrying. */
export function isTransientAiError(err: unknown): boolean {
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return false;
}
