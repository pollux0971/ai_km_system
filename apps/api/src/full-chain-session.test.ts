/**
 * E04-S051: the missing full-chain test that would have caught the
 * `hostRequireSession` snapshot bug. Every other test in this repo either
 * decorates its own fake `requireSession` (domain-isolated harnesses) or
 * uses `x-test-user` (this file's own sibling suites) — nothing, before
 * this story, actually logged in through the real `identityPlugin` and
 * then called a real domain route with the resulting cookie.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "./server.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance | undefined;

/**
 * Every POST/PUT/PATCH/DELETE below carries this. E04-S048 (CSRF, developed
 * in parallel by another lane) requires it on every state-changing request
 * and folds the check into `requireSession` itself — this story's own
 * change (snapshot → live read of `app.requireSession`) is exactly the
 * mechanism E04-S048's check will run through. The header has NO effect yet
 * (E04-S048 is not merged as of this story); it is added now so this
 * story's tests keep passing unmodified once E04-S048 lands, rather than
 * going red under a story that is not allowed to touch this file.
 */
const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };

beforeEach(() => {
  // loadIdentityConfig() reads process.env directly (no override plumbed
  // through buildServer for this package), so the demo accounts this test
  // logs in as are seeded by setting the real env var, not the ApiConfig
  // object passed to buildServer.
  process.env.AI_KM_SEED_DEMO_USERS = "true";
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  delete process.env.AI_KM_SEED_DEMO_USERS;
});

async function buildRealServer(): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  // enableTestAuthProvider: false — the "x-test-user" bypass is OFF, exactly
  // the production-equivalent setting the spec's AC1 requires. If a
  // protected route only ever worked because of that bypass, turning it off
  // is what exposes it.
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });
  return app;
}

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

describe("full-chain: real session cookie reaches conversation-domain routes (E04-S051)", () => {
  it("AC1: POST /v1/conversations accepts a real login cookie (201, not 401)", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    const res = await server.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: { cookie, ...CSRF_HEADER },
    });

    expect(res.statusCode).toBe(201);
  });

  it("negative control: the same route with NO cookie is still 401 (Security AC)", async () => {
    const server = await buildRealServer();
    const res = await server.inject({ method: "POST", url: "/v1/conversations", headers: { ...CSRF_HEADER } });
    expect(res.statusCode).toBe(401);
  });

  it("AC3: GET /v1/conversations accepts the real cookie", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    const res = await server.inject({ method: "GET", url: "/v1/conversations", headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it("AC3: POST .../messages accepts the real cookie", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);
    const conv = await server.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: { cookie, ...CSRF_HEADER },
    });
    const conversationId = conv.json().id as string;

    const res = await server.inject({
      method: "POST",
      url: `/v1/conversations/${conversationId}/messages`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { role: "user", content: "real session smoke" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("AC3: all 4 message-feedback PUT endpoints accept the real cookie", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);
    const conv = await server.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: { cookie, ...CSRF_HEADER },
    });
    const conversationId = conv.json().id as string;
    const msg = await server.inject({
      method: "POST",
      url: `/v1/conversations/${conversationId}/messages`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { role: "assistant", content: "answer [1]", state: "ANSWERED" },
    });
    const messageId = msg.json().id as string;

    const verdict = await server.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { verdict: "NG" },
    });
    expect(verdict.statusCode).toBe(200);

    const reason = await server.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { reason: "INCOMPLETE" },
    });
    expect(reason.statusCode).toBe(200);

    const comment = await server.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { comment: "留言" },
    });
    expect(comment.statusCode).toBe(200);

    const citation = await server.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
      headers: { cookie, ...CSRF_HEADER },
      payload: { verdict: "OK" },
    });
    expect(citation.statusCode).toBe(200);
  });
});

describe("full-chain: /v1/transcriptions (model-gateway) — AC4, measured not assumed", () => {
  it("a real login cookie is NOT rejected with 401 (model-gateway registers after identityPlugin either way)", async () => {
    const server = await buildRealServer();
    const cookie = await loginAsDemoSuperAdmin(server);

    // No real ASR provider is reachable in this test environment; the point
    // is only that authorization passes (not 401) — whatever the ASR
    // provider itself then does (4xx/5xx for a missing/invalid multipart
    // body) is out of scope for this story.
    const res = await server.inject({
      method: "POST",
      url: "/v1/transcriptions",
      headers: { cookie, ...CSRF_HEADER },
    });

    expect(res.statusCode).not.toBe(401);
  });

  it("negative control: no cookie is still 401", async () => {
    const server = await buildRealServer();
    const res = await server.inject({ method: "POST", url: "/v1/transcriptions", headers: { ...CSRF_HEADER } });
    expect(res.statusCode).toBe(401);
  });
});
