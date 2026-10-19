import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db, usersTable, type UserRow, type UserRole } from "@workspace/db";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "veriscope_session";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string {
  const s = process.env["SESSION_SECRET"];
  if (!s) throw new Error("SESSION_SECRET environment variable is required for login.");
  return s;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltHex, keyHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("hex");

/** Signed, expiring session token: `userId.expiresAt.signature`. */
export function createSessionToken(userId: number, now = Date.now()): string {
  const payload = `${userId}.${now + SESSION_MAX_AGE_MS}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [id, exp, sig] = parts as [string, string, string];
  const good = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(sig);
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  if (!Number.isFinite(Number(exp)) || Number(exp) < now) return null;
  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function findUserById(id: number): Promise<UserRow | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return row ?? null;
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const [row] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  return row ?? null;
}

export interface AuthUser { id: number; username: string; displayName: string; role: UserRole }
export const toAuthUser = (u: UserRow): AuthUser => ({ id: u.id, username: u.username, displayName: u.displayName, role: u.role });

// Template accounts for demos. Created only when missing; never overwritten.
export const TEMPLATE_USERS: { username: string; displayName: string; role: UserRole; password: string }[] = [
  { username: "user", displayName: "Normal User", role: "user", password: "user1234" },
  { username: "company", displayName: "Company User", role: "company", password: "company1234" },
];

export async function seedTemplateUsers(): Promise<void> {
  for (const u of TEMPLATE_USERS) {
    if (await findUserByUsername(u.username)) continue;
    await db
      .insert(usersTable)
      .values({ username: u.username, displayName: u.displayName, role: u.role, passwordHash: await hashPassword(u.password) })
      .onConflictDoNothing();
  }
}
