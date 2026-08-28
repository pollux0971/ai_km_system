/**
 * GET /v1/admin/health (E04-S047 AC2) — the first real production consumer
 * of `requireAnyRole` (E02-S033). Modelled on
 * `../full-chain-session.test.ts`'s real-login pattern (E04-S051): a real
 * cookie from a real login, not `x-test-user` (which always carries
 * `roles: []` and so could never legitimately pass this gate).
 */
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { loadConfig } from "../config.js";
import { resolveMigrationsDir } from "../db/migrate.js";

let app: FastifyInstance | undefined;

beforeEach(() => {
  // See full-chain-session.test.ts: loadIdentityConfig() reads process.env
  // directly, so the demo accounts logged into below are seeded via the
  // real env var, not the ApiConfig object passed to buildServer.
  process.env.AI_KM_SEED_DEMO_USERS = "true";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.AI_KM_SEED_DEMO_USERS;
});

async function buildRealServer(): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent", AI_KM_ASR_PROVIDER: "fake" });
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });
  return app;
}

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  if (!match) throw new Error(`no ai_km_session cookie in Set-Cookie: ${JSON.stringify(setCookieHeader)}`);
  return match[0];
}

async function loginAs(server: FastifyInstance, username: string): Promise<string> {
  const res = await server.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username, password: "demo-pass-123" },
  });
  if (res.statusCode !== 200) {
    throw new Error(`demo login failed: ${res.statusCode} ${res.body}`);
  }
  return extractSessionCookie(res.headers["set-cookie"]);
}

describe("GET /v1/admin/health (E04-S047 AC2)", () => {
  it("200s with all 4 subsystems for demo-it (it_administrator, one of the contract's x-required-roles)", async () => {
    const server = await buildRealServer();
    const cookie = await loginAs(server, "demo-it");

    const res = await server.inject({ method: "GET", url: "/v1/admin/health", headers: { cookie } });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.checkedAt).toBe("string");
    expect(body.subsystems).toHaveLength(4);
    const names = body.subsystems.map((s: { name: string }) => s.name).sort();
    expect(names).toEqual(["api", "asr", "database", "migrations"]);
    for (const subsystem of body.subsystems) {
      expect(["ok", "degraded", "down", "unknown"]).toContain(subsystem.status);
    }
  });

  it("403s for demo-user (general_user, not in x-required-roles), and does not leak the required-roles list", async () => {
    const server = await buildRealServer();
    const cookie = await loginAs(server, "demo-user");

    const res = await server.inject({ method: "GET", url: "/v1/admin/health", headers: { cookie } });

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain("it_administrator");
    expect(res.body).not.toContain("ai_administrator");
    expect(res.body).not.toContain("auditor");
    expect(res.body).not.toContain("super_administrator");
  });

  it("401s with no session at all", async () => {
    const server = await buildRealServer();
    const res = await server.inject({ method: "GET", url: "/v1/admin/health" });
    expect(res.statusCode).toBe(401);
  });

  it("200s for demo-super (super_administrator implicitly passes every requireAnyRole gate, E02-S033)", async () => {
    const server = await buildRealServer();
    const cookie = await loginAs(server, "demo-super");

    const res = await server.inject({ method: "GET", url: "/v1/admin/health", headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it("AC4: migrations reports degraded and names the pending file when a disk migration has not been applied", async () => {
    // Copy the REAL migrations dir into a throwaway temp dir so autoMigrate
    // brings up a fully working schema (login, sessions, etc. all need
    // it) — then add ONE more .sql file to that same temp dir AFTER the
    // server has started, so it is on disk but was never applied. This
    // proves the real /v1/admin/health route surfaces checkMigrations' AC4
    // behaviour end to end, on top of checks.test.ts's unit-level coverage.
    const tempMigrationsDir = mkdtempSync(path.join(tmpdir(), "ai-km-admin-health-migrations-"));
    cpSync(resolveMigrationsDir(), tempMigrationsDir, { recursive: true });

    const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent", AI_KM_ASR_PROVIDER: "fake" });
    app = await buildServer({
      config,
      dbPath: ":memory:",
      enableTestAuthProvider: false,
      migrationsDir: tempMigrationsDir,
    });
    const cookie = await loginAs(app, "demo-it");

    writeFileSync(path.join(tempMigrationsDir, "9999_not_yet_applied.sql"), "SELECT 1;", "utf8");

    const res = await app.inject({ method: "GET", url: "/v1/admin/health", headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const migrations = res.json().subsystems.find((s: { name: string }) => s.name === "migrations");
    expect(migrations.status).toBe("degraded");
    expect(migrations.detail).toContain("9999_not_yet_applied.sql");
  });
});
