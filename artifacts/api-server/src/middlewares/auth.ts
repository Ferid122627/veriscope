import type { Request, Response, NextFunction } from "express";
import { SESSION_COOKIE, findUserById, parseCookies, readSessionToken, toAuthUser, type AuthUser } from "../lib/auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

const COMPANY_FIELDS = new Set(["playbookTitle", "playbookRuleQuote", "playbookRuleVerified", "playbookGap"]);

/** Normal users have no company rules: blank every company-rule field in a response. */
export function scrubCompanyFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubCompanyFields);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = COMPANY_FIELDS.has(k) ? null : scrubCompanyFields(v);
    return out;
  }
  return value;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = readSessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    const user = userId ? await findUserById(userId) : null;
    if (!user) {
      res.status(401).json({ error: "Please sign in." });
      return;
    }
    req.user = toAuthUser(user);
    if (user.role !== "company") {
      const json = res.json.bind(res);
      res.json = (body: unknown) => json(scrubCompanyFields(body));
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireCompany(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "company") {
    res.status(403).json({ error: "Only company users can use company rules." });
    return;
  }
  next();
}
