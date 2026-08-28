/**
 * E04-S053: the existing 264 E2E specs are written against `apps/web/src/
 * test/fake-api.ts`'s client-side fake, whose sandbox seeds conversations
 * but ZERO messages (`messageStore = []`). E04-S052 wired BOTH
 * `conversationSandboxSeeders` and `messageSandboxSeeders` into the real
 * server-side sandbox, so a real sandbox login now gets non-empty
 * conversations — breaking every "opening a conversation should show no
 * messages yet" assertion. This story narrows the wiring back to
 * conversations only; `messageSandboxSeeders` itself is untouched (still a
 * valid E04-S042 export, just no longer part of the sandbox's DEFAULT
 * starting state).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance | undefined;

const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };

beforeEach(() => {
  process.env.AI_KM_SEED_DEMO_USERS = "true";
  process.env.AI_KM_TEST_SANDBOX = "true";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.AI_KM_SEED_DEMO_USERS;
  delete process.env.AI_KM_TEST_SANDBOX;
});

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
  if (res.statusCode !== 200) throw new Error(`demo login failed: ${res.statusCode} ${res.body}`);
  return extractSessionCookie(res.headers["set-cookie"]);
}

async function buildRealServer(): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });
  return app;
}

describe("sandbox seeder default scope: conversations, but zero messages (E04-S053)", () => {
  it("AC1: a real sandbox login has seeded conversations but ZERO messages in any of them", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    const list = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie } });
    expect(list.statusCode).toBe(200);
    const conversations = (list.json() as { items: Array<{ id: string }>; totalCount: number }).items;
    expect(conversations.length).toBeGreaterThan(0);

    for (const conversation of conversations) {
      const messages = await server.inject({
        method: "GET",
        url: `/v1/conversations/${conversation.id}/messages`,
        headers: { cookie },
      });
      expect(messages.statusCode).toBe(200);
      expect(messages.json()).toEqual([]);
    }
  });
});
