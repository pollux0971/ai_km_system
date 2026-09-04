import type { Database } from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "./testing/db.js";
import { seedDemoUsers, insertSession, findSessionWithUserByTokenHash } from "./repository.js";
import { generateSessionToken, hashSessionToken } from "./crypto.js";
import {
  SESSION_COOKIE_NAME,
  buildRealRequireSession,
  composeRequireSession,
  requireAnyRole,
  setSessionCookie,
} from "./require-session.js";

/**
 * E04-S055: relative to `Date.now()` at test-run time, not a hardcoded
 * literal. `buildRealRequireSession` compares `last_seen_at` against REAL
 * wall-clock time (`SESSION_IDLE_LIMIT_MS`, 12h — a real product rule, not
 * something this file may weaken), so a fixed-in-the-past literal here
 * eventually crosses that 12h window and every test seeding a session with
 * it starts failing — which is exactly what happened: this file was green
 * on 2026-08-28 and red by 2026-08-29 with zero code change, purely from
 * wall-clock drift. Anchoring both constants to `Date.now()` means they are
 * always "1 minute ago" / "7 days from now" relative to whenever the suite
 * actually runs, so this holds on any date, not just today (verified by
 * simulating a 30-day time jump — see archive/stories/E04-S055.md).
 */
const NOW = new Date(Date.now() - 60_000).toISOString();
const FAR_FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

let db: Database;
let app: FastifyInstance;

async function buildApp(preHandler: ReturnType<typeof buildRealRequireSession>): Promise<FastifyInstance> {
  const instance = Fastify();
  await instance.register(cookie);
  instance.get("/protected", { preHandler }, async (request) => ({
    userId: request.auth?.userId,
    ownerKey: request.auth?.ownerKey,
    roles: request.auth?.roles,
  }));
  await instance.ready();
  return instance;
}

async function seedSession(overrides: {
  lastSeenAt?: string;
  expiresAt?: string;
  disabled?: boolean;
}): Promise<string> {
  await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
  if (overrides.disabled) {
    db.prepare("UPDATE users SET disabled = 1 WHERE id = 'mock-user-1'").run();
  }
  const token = generateSessionToken();
  insertSession(db, {
    id: "sess-1",
    tokenHash: hashSessionToken(token),
    userId: "mock-user-1",
    ownerKey: "mock-user-1",
    createdAt: NOW,
    lastSeenAt: overrides.lastSeenAt ?? NOW,
    expiresAt: overrides.expiresAt ?? FAR_FUTURE,
  });
  return token;
}

beforeEach(() => {
  db = createTestDatabase();
});

afterEach(async () => {
  db.close();
  await app?.close();
});

describe("buildRealRequireSession", () => {
  it("401s with no cookie and never runs the handler", async () => {
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHENTICATED");
  });

  it("populates request.auth for a valid session", async () => {
    const token = await seedSession({});
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: "mock-user-1", ownerKey: "mock-user-1", roles: ["general_user"] });
  });

  it("advances last_seen_at on a successful check", async () => {
    const token = await seedSession({});
    app = await buildApp(buildRealRequireSession(db));
    await app.inject({ method: "GET", url: "/protected", cookies: { [SESSION_COOKIE_NAME]: token } });
    const row = findSessionWithUserByTokenHash(db, hashSessionToken(token));
    expect(row?.last_seen_at).not.toBe(NOW);
    expect(Date.parse(row!.last_seen_at)).toBeGreaterThan(Date.parse(NOW));
  });

  it("401s and clears the cookie for a tampered/unknown token", async () => {
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: "not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toMatch(/ai_km_session=;/);
  });

  it("401s and deletes the row for an absolutely-expired session", async () => {
    const token = await seedSession({ expiresAt: "2026-01-01T00:00:00.000Z" });
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(401);
    expect(findSessionWithUserByTokenHash(db, hashSessionToken(token))).toBeUndefined();
  });

  it("401s for a session idle more than 12h, even though not absolutely expired", async () => {
    const staleLastSeen = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    const token = await seedSession({ lastSeenAt: staleLastSeen });
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts a session idle less than 12h", async () => {
    const recentLastSeen = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString();
    const token = await seedSession({ lastSeenAt: recentLastSeen });
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("401s when the account has since been disabled, and purges the session", async () => {
    const token = await seedSession({ disabled: true });
    app = await buildApp(buildRealRequireSession(db));
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(401);
    expect(findSessionWithUserByTokenHash(db, hashSessionToken(token))).toBeUndefined();
  });
});

describe("composeRequireSession (AC9 / preserves the E04-S039 seam)", () => {
  it("uses the real check when a cookie is present, ignoring any previous handler", async () => {
    const token = await seedSession({});
    const previous = vi.fn();
    const composed = composeRequireSession(buildRealRequireSession(db), previous);
    app = await buildApp(composed);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
    expect(previous).not.toHaveBeenCalled();
  });

  it("falls back to the previous handler when no cookie is present", async () => {
    const previous = vi.fn(async (request, reply) => {
      request.auth = { userId: "fallback", ownerKey: "fallback", roles: [], sessionId: "s" };
      void reply;
    });
    const composed = composeRequireSession(buildRealRequireSession(db), previous);
    app = await buildApp(composed);
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe("fallback");
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it("fails closed with 401 when no cookie AND no previous handler exists", async () => {
    const composed = composeRequireSession(buildRealRequireSession(db), undefined);
    app = await buildApp(composed);
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
  });

  it("does not call the previous handler when the cookie is invalid (fails closed, does not fall through)", async () => {
    const previous = vi.fn();
    const composed = composeRequireSession(buildRealRequireSession(db), previous);
    app = await buildApp(composed);
    const res = await app.inject({
      method: "GET",
      url: "/protected",
      cookies: { [SESSION_COOKIE_NAME]: "garbage" },
    });
    expect(res.statusCode).toBe(401);
    expect(previous).not.toHaveBeenCalled();
  });
});

describe("requireAnyRole (E02-S033, AC2/AC3)", () => {
  async function tokenFor(username: string): Promise<string> {
    await seedDemoUsers(db, { seedDemoUsers: true }, NOW);
    const user = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string };
    const token = generateSessionToken();
    insertSession(db, {
      id: `sess-${username}`,
      tokenHash: hashSessionToken(token),
      userId: user.id,
      ownerKey: user.id,
      createdAt: NOW,
      lastSeenAt: NOW,
      expiresAt: FAR_FUTURE,
    });
    return token;
  }

  async function buildGuardedApp(): Promise<FastifyInstance> {
    const instance = Fastify();
    await instance.register(cookie);
    instance.get(
      "/auditor-only",
      { preHandler: [buildRealRequireSession(db), requireAnyRole(["auditor"])] },
      async () => ({ ok: true }),
    );
    await instance.ready();
    return instance;
  }

  it("200s for a user who holds the required role (demo-auditor)", async () => {
    const token = await tokenFor("demo-auditor");
    app = await buildGuardedApp();
    const res = await app.inject({
      method: "GET",
      url: "/auditor-only",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("403s PERMISSION_DENIED for a user who does not hold the required role (demo-user)", async () => {
    const token = await tokenFor("demo-user");
    app = await buildGuardedApp();
    const res = await app.inject({
      method: "GET",
      url: "/auditor-only",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PERMISSION_DENIED");
  });

  it("does not leak the required roles list in the 403 body", async () => {
    const token = await tokenFor("demo-user");
    app = await buildGuardedApp();
    const res = await app.inject({
      method: "GET",
      url: "/auditor-only",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.body).not.toContain("auditor");
  });

  it("401s with no session at all (requireSession denies before requireAnyRole runs)", async () => {
    app = await buildGuardedApp();
    const res = await app.inject({ method: "GET", url: "/auditor-only" });
    expect(res.statusCode).toBe(401);
  });

  it("super_administrator always passes, even though it is not in the required roles list (implicit pass)", async () => {
    const token = await tokenFor("demo-super");
    app = await buildGuardedApp();
    const res = await app.inject({
      method: "GET",
      url: "/auditor-only",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("regression: an empty required-roles intersection still passes for super_administrator", async () => {
    const token = await tokenFor("demo-super");
    const instance = Fastify();
    await instance.register(cookie);
    instance.get(
      "/nobody-else-qualifies",
      { preHandler: [buildRealRequireSession(db), requireAnyRole(["knowledge_manager"])] },
      async () => ({ ok: true }),
    );
    await instance.ready();
    app = instance;
    const res = await app.inject({
      method: "GET",
      url: "/nobody-else-qualifies",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(200);
  });

  it("403s when the role intersection is genuinely empty (regression: intersection-empty must still deny)", async () => {
    const token = await tokenFor("demo-km");
    const instance = Fastify();
    await instance.register(cookie);
    instance.get(
      "/it-only",
      { preHandler: [buildRealRequireSession(db), requireAnyRole(["it_administrator"])] },
      async () => ({ ok: true }),
    );
    await instance.ready();
    app = instance;
    const res = await app.inject({
      method: "GET",
      url: "/it-only",
      cookies: { [SESSION_COOKIE_NAME]: token },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("session cookie Domain attribute (E02-S033 AC4)", () => {
  it("setSessionCookie includes Domain when a domain is passed", async () => {
    const instance = Fastify();
    await instance.register(cookie);
    instance.get("/set", async (request, reply) => {
      setSessionCookie(reply, request, "tok", "example.internal");
      return { ok: true };
    });
    await instance.ready();
    app = instance;
    const res = await app.inject({ method: "GET", url: "/set" });
    expect(res.headers["set-cookie"]).toMatch(/Domain=example\.internal/i);
  });

  it("setSessionCookie omits Domain when none is passed", async () => {
    const instance = Fastify();
    await instance.register(cookie);
    instance.get("/set", async (request, reply) => {
      setSessionCookie(reply, request, "tok");
      return { ok: true };
    });
    await instance.ready();
    app = instance;
    const res = await app.inject({ method: "GET", url: "/set" });
    expect(res.headers["set-cookie"]).not.toMatch(/Domain=/i);
  });

  it("clearSessionCookie (deny path) also carries Domain, so a browser can actually delete a domain-scoped cookie", async () => {
    app = await buildApp(buildRealRequireSession(db, "example.internal"));
    const res = await app.inject({ method: "GET", url: "/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.headers["set-cookie"]).toMatch(/Domain=example\.internal/i);
  });
});
