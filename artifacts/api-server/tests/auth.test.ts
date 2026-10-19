import { describe, it, expect, vi } from "vitest";

const request = (await vi.importActual<{ default: typeof import("supertest") }>("supertest")).default;
const { default: app } = await import("../src/app");
const { readSessionToken, createSessionToken, SESSION_COOKIE } = await import("../src/lib/auth");

async function login(username: string, password: string) {
  const res = await request(app).post("/api/auth/login").send({ username, password });
  const cookie = (res.headers["set-cookie"] as unknown as string[] | undefined)?.[0]?.split(";")[0];
  return { res, cookie };
}

describe("authentication", () => {
  it("keeps the API closed without a session but leaves health open", async () => {
    expect((await request(app).get("/api/documents")).status).toBe(401);
    expect((await request(app).get("/api/playbook")).status).toBe(401);
    expect((await request(app).get("/api/healthz")).status).toBe(200);
  });

  it("signs in both template users and returns their role", async () => {
    const u = await login("user", "user1234");
    expect(u.res.status).toBe(200);
    expect(u.res.body.user).toMatchObject({ username: "user", role: "user" });
    expect(u.res.body.user.passwordHash).toBeUndefined();
    expect(u.res.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/i);
    const c = await login("company", "company1234");
    expect(c.res.body.user.role).toBe("company");
    const me = await request(app).get("/api/auth/me").set("Cookie", c.cookie!);
    expect(me.body.user.username).toBe("company");
  });

  it("rejects wrong passwords and unknown users with the same message", async () => {
    const a = await login("user", "nope");
    const b = await login("ghost", "nope");
    expect(a.res.status).toBe(401);
    expect(b.res.status).toBe(401);
    expect(a.res.body.error).toBe(b.res.body.error);
    expect((await login("", "")).res.status).toBe(400);
  });

  it("rejects tampered and expired tokens", () => {
    const t = createSessionToken(1);
    expect(readSessionToken(t)).toBe(1);
    expect(readSessionToken(t.replace(/^1\./, "2."))).toBeNull();
    expect(readSessionToken(createSessionToken(1, Date.now() - 8 * 24 * 3600 * 1000))).toBeNull();
    expect(readSessionToken("garbage")).toBeNull();
  });

  it("logout clears the cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(204);
    expect(String(res.headers["set-cookie"])).toContain(`${SESSION_COOKIE}=;`);
  });

  it("only the company user can see or change company rules", async () => {
    const u = await login("user", "user1234");
    const c = await login("company", "company1234");
    expect((await request(app).get("/api/playbook").set("Cookie", u.cookie!)).status).toBe(403);
    expect((await request(app).delete("/api/playbook").set("Cookie", u.cookie!)).status).toBe(403);
    expect((await request(app).post("/api/playbook").set("Cookie", u.cookie!).attach("file", Buffer.from("Rule 1. Pay in 30 days."), "r.txt")).status).toBe(403);
    expect((await request(app).get("/api/playbook").set("Cookie", c.cookie!)).status).toBe(200);
  });

  it("hides company-rule fields from the normal user", async () => {
    const { scrubCompanyFields } = await import("../src/middlewares/auth");
    const out = scrubCompanyFields({ a: [{ playbookRuleQuote: "x", playbookGap: "y", playbookTitle: "t", playbookRuleVerified: true, title: "keep" }] });
    expect(out).toEqual({ a: [{ playbookRuleQuote: null, playbookGap: null, playbookTitle: null, playbookRuleVerified: null, title: "keep" }] });
  });
});
