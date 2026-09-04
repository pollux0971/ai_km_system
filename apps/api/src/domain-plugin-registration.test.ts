/**
 * E04-S050: `conversationPlugin` registers CONDITIONALLY on
 * `contracts.specNames().includes("conversations")` — the same pattern
 * `server.ts` already used for the `__test__` routes ("sample"). Before this
 * story the registration was unconditional, so a conversation route calling
 * `app.contracts.getSchema("conversations", ...)` at registration time threw
 * under `apps/api`'s own fixture-only bootstrap tests (`server.test.ts`,
 * `db/migrate.test.ts` — they build against `src/testing/fixtures`, which
 * only defines "sample"). See `archive/stories/E04-S050.md`.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";
import { loadContracts, resolveContractsDir } from "./contracts.js";

const FIXTURES = path.dirname(fileURLToPath(import.meta.url)) + "/testing/fixtures";

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("conditional domain-plugin registration (E04-S050)", () => {
  it("AC1: the fixture contracts dir does not define \"conversations\"", async () => {
    const reg = await loadContracts(FIXTURES);
    expect(reg.specNames()).not.toContain("conversations");
  });

  it("AC1: given only the fixture contracts dir, conversationPlugin is NOT registered and the server still starts", async () => {
    const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
    app = await buildServer({ config, contractsDir: FIXTURES, dbPath: ":memory:" });

    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(200);

    // Not registered ⇒ Fastify's default 404, never a 500 (schema-binding
    // crash) and never a 200/201 (an accidental auth bypass).
    const list = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(list.statusCode).toBe(404);
    const create = await app.inject({ method: "POST", url: "/v1/conversations" });
    expect(create.statusCode).toBe(404);
  });

  it("AC2: the real contracts dir does define \"conversations\"", async () => {
    const reg = await loadContracts(resolveContractsDir());
    expect(reg.specNames()).toContain("conversations");
  });

  it("AC2: given the real contracts dir, conversationPlugin IS registered and its schema binds via getSchema() without throwing", async () => {
    const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
    // No contractsDir override ⇒ resolveContractsDir(), the real repo
    // contracts. If POST /v1/conversations/:id/messages's
    // `getSchema("conversations", "CreateMessageRequest")` call threw during
    // registration, this buildServer() call itself would reject — reaching
    // the assertions below already proves it did not.
    app = await buildServer({ config, dbPath: ":memory:" });

    // Registered ⇒ requireSession's 401 (never a 404 — the route exists),
    // proving both registration and schema-binding succeeded.
    const list = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(list.statusCode).toBe(401);
  });
});
