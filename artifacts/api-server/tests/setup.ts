import { vi } from "vitest";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { SESSION_COOKIE, createSessionToken, seedTemplateUsers } from "../src/lib/auth";

// Every request in the test suite is made as the company user, as if signed in.
// tests/auth.test.ts imports the real supertest to exercise login itself.
await seedTemplateUsers();
const [company] = await db.select().from(usersTable).where(eq(usersTable.username, "company"));
const cookie = `${SESSION_COOKIE}=${createSessionToken(company!.id)}`;

const METHODS = new Set(["get", "post", "put", "patch", "delete"]);
vi.mock("supertest", async (importOriginal) => {
  const mod = await importOriginal<{ default: (app: unknown) => Record<string, (...a: unknown[]) => { set: (k: string, v: string) => unknown }> }>();
  const wrapped = (app: unknown) =>
    new Proxy(mod.default(app), {
      get(target, prop: string) {
        const v = target[prop];
        if (METHODS.has(prop)) return (...a: unknown[]) => (v as (...x: unknown[]) => { set: (k: string, v: string) => unknown }).apply(target, a).set("Cookie", cookie);
        return v;
      },
    });
  return { default: wrapped };
});
