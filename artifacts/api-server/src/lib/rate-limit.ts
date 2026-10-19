import type { RequestHandler } from "express";

export interface RateLimitOptions {
  windowMs: number;
  /** Max requests per client in the window. */
  perClient: number;
  /** Max requests from everyone combined in the window. */
  global: number;
  now?: () => number;
  /** Error shown when the limit is hit. */
  message?: string;
}

/**
 * Fixed-window, in-memory limiter for requests that start paid AI work. It is
 * per server process, so it bounds cost on one instance but is not a
 * substitute for authentication or a shared limiter across instances.
 */
export function createRateLimiter(opts: RateLimitOptions): RequestHandler {
  const now = opts.now ?? Date.now;
  const clients = new Map<string, { count: number; resetAt: number }>();
  let global = { count: 0, resetAt: 0 };

  return (req, res, next) => {
    const t = now();
    if (t >= global.resetAt) global = { count: 0, resetAt: t + opts.windowMs };
    if (clients.size > 5000) for (const [k, v] of clients) if (t >= v.resetAt) clients.delete(k);
    const key = req.ip ?? "unknown";
    let c = clients.get(key);
    if (!c || t >= c.resetAt) {
      c = { count: 0, resetAt: t + opts.windowMs };
      clients.set(key, c);
    }
    const retryAfter = Math.ceil((Math.min(c.resetAt, global.resetAt) - t) / 1000);
    if (c.count >= opts.perClient || global.count >= opts.global) {
      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      res.status(429).json({ error: opts.message ?? "Too many AI checks were started recently. Please wait a few minutes and try again." });
      return;
    }
    c.count++;
    global.count++;
    next();
  };
}

const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
// Tests start many analyses from one address, so they get a very high default.
const inTest = process.env["NODE_ENV"] === "test" || process.env["VITEST"] !== undefined;

/** Limit for endpoints that call the AI provider. Override with AI_RATE_LIMIT_* env vars. */
export const aiRateLimit = createRateLimiter({
  windowMs: num(process.env["AI_RATE_LIMIT_WINDOW_MS"], 15 * 60_000),
  perClient: num(process.env["AI_RATE_LIMIT_PER_CLIENT"], inTest ? 1_000_000 : 20),
  global: num(process.env["AI_RATE_LIMIT_GLOBAL"], inTest ? 1_000_000 : 60),
});

/** Separate, larger budget for assistant chat questions so chatting cannot block document checks. */
export const assistantRateLimit = createRateLimiter({
  windowMs: num(process.env["ASSISTANT_RATE_LIMIT_WINDOW_MS"], 15 * 60_000),
  perClient: num(process.env["ASSISTANT_RATE_LIMIT_PER_CLIENT"], inTest ? 1_000_000 : 30),
  global: num(process.env["ASSISTANT_RATE_LIMIT_GLOBAL"], inTest ? 1_000_000 : 120),
  message: "Too many questions were asked recently. Please wait a few minutes and try again.",
});
