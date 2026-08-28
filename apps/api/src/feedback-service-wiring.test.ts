/**
 * E13-S019: `feedbackPlugin` (`@ai-km/service-feedback`) registers
 * conditionally on `contracts.specNames().includes("analytics")` — same
 * pattern `conversationPlugin` already uses (E04-S050). This is the
 * end-to-end proof of the composition-root wiring itself: a real login,
 * against the real assembled server, exercising the real `analytics.yaml`
 * contract — the service package's own 43 tests already cover each route's
 * business logic in isolation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { loadContracts, resolveContractsDir } from "./contracts.js";

const FIXTURES = new URL("./testing/fixtures", import.meta.url).pathname;

let app: FastifyInstance | undefined;

const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };

beforeEach(() => {
  process.env.AI_KM_SEED_DEMO_USERS = "true";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.AI_KM_SEED_DEMO_USERS;
});

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  if (!match) throw new Error(`no ai_km_session cookie in Set-Cookie: ${JSON.stringify(setCookieHeader)}`);
  return match[0];
}

async function login(server: FastifyInstance, username: string): Promise<string> {
  const res = await server.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { ...CSRF_HEADER },
    payload: { username, password: "demo-pass-123" },
  });
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  return extractSessionCookie(res.headers["set-cookie"]);
}

async function buildRealServer(): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });
  return app;
}

describe("conditional registration (E13-S019, same guard as E04-S050)", () => {
  it("the fixture contracts dir does not define \"analytics\"", async () => {
    const reg = await loadContracts(FIXTURES);
    expect(reg.specNames()).not.toContain("analytics");
  });

  it("given only the fixture contracts dir, feedbackPlugin is NOT registered and the server still starts", async () => {
    const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
    app = await buildServer({ config, contractsDir: FIXTURES, dbPath: ":memory:" });

    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(200);

    const usageEvents = await app.inject({ method: "POST", url: "/v1/usage-events" });
    expect(usageEvents.statusCode).toBe(404);
  });

  it("the real contracts dir does define \"analytics\"", async () => {
    const reg = await loadContracts(resolveContractsDir());
    expect(reg.specNames()).toContain("analytics");
  });
});

describe("full-chain: real session cookie reaches the feedback service (E13-S019)", () => {
  it("AC1: POST /v1/usage-events accepts a real login cookie (201, not 401/404)", async () => {
    const server = await buildRealServer();
    const cookie = await login(server, "demo-super");

    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { cookie, ...CSRF_HEADER },
      payload: { name: "conversation_created", occurredAt: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(201);
  });

  it("negative control: the same route with NO cookie is still 401", async () => {
    const server = await buildRealServer();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { ...CSRF_HEADER },
      payload: { name: "conversation_created", occurredAt: new Date().toISOString() },
    });
    expect(res.statusCode).toBe(401);
  });

  it("AC2/AC3: demo-auditor (real role from the real identity plugin) can read admin metrics and the feedback queue", async () => {
    const server = await buildRealServer();
    const cookie = await login(server, "demo-auditor");

    const usage = await server.inject({
      method: "GET",
      url: `/v1/admin/metrics/usage?date=${new Date().toISOString().slice(0, 10)}`,
      headers: { cookie },
    });
    expect(usage.statusCode).toBe(200);

    const latency = await server.inject({ method: "GET", url: "/v1/admin/metrics/latency", headers: { cookie } });
    expect(latency.statusCode).toBe(200);

    const feedback = await server.inject({ method: "GET", url: "/v1/admin/feedback", headers: { cookie } });
    expect(feedback.statusCode).toBe(200);
  });

  it("Security AC: demo-user (real general_user role) is 403 on the admin feedback queue", async () => {
    const server = await buildRealServer();
    const cookie = await login(server, "demo-user");

    const res = await server.inject({ method: "GET", url: "/v1/admin/feedback", headers: { cookie } });
    expect(res.statusCode).toBe(403);
  });
});
