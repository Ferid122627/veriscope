import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  SESSION_COOKIE, SESSION_MAX_AGE_MS, createSessionToken, findUserByUsername, toAuthUser, verifyPassword, hashPassword,
} from "../lib/auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const Body = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(200) });

// Slow down password guessing: 10 failures per client per 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = process.env["VITEST"] ? 1000 : 10;
const fails = new Map<string, { n: number; reset: number }>();
// Computed once so unknown usernames take as long to reject as wrong passwords.
const dummyHash = hashPassword("not-a-real-password");

const cookieOptions = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env["NODE_ENV"] === "production", path: "/" });

router.post("/auth/login", async (req, res) => {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const f = fails.get(key);
  if (f && f.reset > now && f.n >= MAX_FAILS) {
    res.status(429).json({ error: "Too many failed attempts. Try again in a few minutes." });
    return;
  }
  const body = Body.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Enter your username and password." });
    return;
  }
  const user = await findUserByUsername(body.data.username);
  const ok = await verifyPassword(body.data.password, user ? user.passwordHash : await dummyHash);
  if (!user || !ok) {
    fails.set(key, { n: f && f.reset > now ? f.n + 1 : 1, reset: f && f.reset > now ? f.reset : now + WINDOW_MS });
    res.status(401).json({ error: "Wrong username or password." });
    return;
  }
  fails.delete(key);
  res.cookie(SESSION_COOKIE, createSessionToken(user.id), { ...cookieOptions(), maxAge: SESSION_MAX_AGE_MS });
  res.json({ user: toAuthUser(user) });
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
