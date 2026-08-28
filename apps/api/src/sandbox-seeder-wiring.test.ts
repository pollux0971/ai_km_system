/**
 * E04-S052: `services/identity`'s sandbox-seeder registry (E02-S032 AC7) had
 * zero production callers — `conversationSandboxSeeders` /
 * `messageSandboxSeeders` (E04-S041/S042) were written and exported but
 * never registered. A sandbox login therefore got an empty account.
 * `server.ts` now bridges the two at the composition root; this is the
 * real, end-to-end proof (real `buildServer()`, real login, real db) rather
 * than a unit test of the wiring function in isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance | undefined;

beforeEach(() => {
  // loadIdentityConfig() and the demo-account seeder both read process.env
  // directly (no override plumbed through buildServer for this package) —
  // same pattern full-chain-session.test.ts (E04-S051) already established.
  process.env.AI_KM_SEED_DEMO_USERS = "true";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.AI_KM_SEED_DEMO_USERS;
  delete process.env.AI_KM_TEST_SANDBOX;
});

const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  if (!match) throw new Error(`no ai_km_session cookie in Set-Cookie: ${JSON.stringify(setCookieHeader)}`);
  return match[0];
}

async function loginAsDemoSuperAdmin(server: FastifyInstance): Promise<string> {
  const res = await server.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { ...CSRF_HEADER },
    payload: { username: "demo-super", password: "demo-pass-123" },
  });
  if (res.statusCode !== 200) {
    throw new Error(`demo login failed: ${res.statusCode} ${res.body}`);
  }
  return extractSessionCookie(res.headers["set-cookie"]);
}

async function buildRealServer(): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });
  return app;
}

describe("sandbox seeder wiring (E04-S052)", () => {
  it("AC1: AI_KM_TEST_SANDBOX=true — a real login's ownerKey has seeded conversations and messages", async () => {
    process.env.AI_KM_TEST_SANDBOX = "true";
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    const list = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const body = list.json() as { items: Array<{ id: string; title: string }>; totalCount: number };
    expect(body.totalCount).toBe(3);
    expect(body.items.map((c) => c.title).sort()).toEqual(
      ["Q3 銷售報表彙整", "產品保固政策詢問", "設備 E-204 錯誤代碼排查"].sort(),
    );

    const withMessages = body.items.find((c) => c.title === "產品保固政策詢問")!;
    const messages = await server.inject({
      method: "GET",
      url: `/v1/conversations/${withMessages.id}/messages`,
      headers: { cookie },
    });
    expect(messages.statusCode).toBe(200);
    expect((messages.json() as unknown[]).length).toBeGreaterThan(0);
  });

  it("AC2: AI_KM_TEST_SANDBOX not set — a real login's ownerKey has NO seeded data (no side effect)", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    const list = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { totalCount: number }).totalCount).toBe(0);
  });

  it("Security AC: two separate sandbox logins each see only their OWN 3 seeded conversations, never the other's", async () => {
    process.env.AI_KM_TEST_SANDBOX = "true";
    const server = await buildRealServer();
    const cookieA = await loginAsDemoSuperAdmin(server);
    const cookieB = await loginAsDemoSuperAdmin(server);

    const listA = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie: cookieA } });
    const listB = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie: cookieB } });
    expect((listA.json() as { totalCount: number }).totalCount).toBe(3);
    expect((listB.json() as { totalCount: number }).totalCount).toBe(3);

    const idsA = new Set((listA.json() as { items: Array<{ id: string }> }).items.map((c) => c.id));
    const idsB = new Set((listB.json() as { items: Array<{ id: string }> }).items.map((c) => c.id));
    for (const id of idsA) expect(idsB.has(id)).toBe(false);
  });
});
