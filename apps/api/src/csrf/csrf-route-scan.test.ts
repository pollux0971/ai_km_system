/**
 * E04-S048 AC5 — the safety net.
 *
 * This does NOT check "does route X have a preHandler line" — there is no
 * such line to check (see docs/stories/E04-S048.md for why CSRF is fused
 * into `services/identity`'s `requireSession` instead of mounted per-route).
 * Instead it enumerates the REAL, ACTUALLY-REGISTERED route table of the
 * REAL assembled server (`buildServer()`, imported — never modified) and
 * fires a genuine cross-site-shaped request at every state-changing one.
 *
 * This is deliberately STRONGER than a checklist: a brand-new route added
 * next month that forgets to require a session (and so never reaches the
 * CSRF check at all) makes THIS test fail, because it walks whatever
 * `app.printRoutes()` reports — not a list this file remembers.
 */
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { parseFastifyRoutes, stateChangingRoutesOf, type RouteEntry } from "./parse-fastify-routes.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

function fillParams(path: string): string {
  return path.replace(/:[a-zA-Z0-9_]+/g, "00000000-0000-0000-0000-000000000000");
}

/**
 * Fastify validates a route's body schema BEFORE its `preHandler` runs
 * (onRequest -> preParsing -> preValidation -> validation -> preHandler),
 * so a schema-invalid/empty body on a route that requires specific fields
 * gets 400 VALIDATION_ERROR before ever reaching the CSRF check — that is
 * not a bypass (the state change still never happens), but it DOES make
 * the scan's assertion of an exact 403 CSRF_HEADER_MISSING meaningless for
 * that route, since the request never got far enough to be evaluated by
 * it. A minimal schema-satisfying payload per KNOWN route keeps the
 * assertion meaningful; an unrecognised future route falls back to `{}` —
 * if that 400s instead of 403ing, this test fails loudly rather than
 * silently skipping coverage, which is the forcing function that makes
 * someone add the route's real payload here.
 */
function payloadFor(route: RouteEntry): Record<string, unknown> {
  if (route.path === "/v1/conversations/:conversationId/messages") {
    return { role: "user", content: "x" };
  }
  if (route.path === "/v1/conversations/:conversationId/messages/:messageId/revisions") {
    return { content: "x" };
  }
  if (route.path === "/v1/auth/login") {
    return { username: "demo-user", password: "demo-pass-123" };
  }
  return {};
}

async function buildRealServer(): Promise<FastifyInstance> {
  const { loadConfig } = await import("../config.js");
  // A fresh, uniquely-named SQLite file per test — `config.dbPath` defaults
  // to a REAL on-disk file (`./data/ai-km.sqlite`), not `:memory:`; sharing
  // it across tests/runs let stale login_attempts and sessions from earlier
  // runs bleed into later ones (discovered while first writing this file —
  // see docs/stories/E04-S048.md's Assumptions for the exact symptom).
  const dbPath = path.join(tmpdir(), `ai-km-csrf-route-scan-${randomUUID()}.sqlite`);
  const instance = await buildServer({
    config: loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" }),
    dbPath,
  });
  app = instance;
  return instance;
}

async function loginAndGetCookie(instance: FastifyInstance): Promise<string> {
  const res = await instance.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-requested-with": "XMLHttpRequest" },
    payload: { username: "demo-user", password: "demo-pass-123" },
  });
  const match = String(res.headers["set-cookie"]).match(/ai_km_session=([^;]+)/);
  if (!match?.[1]) {
    throw new Error(`could not obtain a real session cookie — login responded ${res.statusCode}: ${res.body}`);
  }
  return match[1];
}

async function discoverStateChangingRoutes(instance: FastifyInstance): Promise<RouteEntry[]> {
  const printed = instance.printRoutes({ commonPrefix: false });
  return stateChangingRoutesOf(parseFastifyRoutes(printed));
}

/**
 * BLOCKED_DEPENDENCY, reported to ai-km-e4 (2026-08-28), recorded in
 * `docs/stories/PENDING_DECISIONS.md`: `services/conversation`'s
 * `hostRequireSession(app)` reads `app.requireSession` once, at
 * `conversationPlugin`'s OWN registration time — which `apps/api/src/server.ts`
 * runs BEFORE `identityPlugin` (the plugin that replaces the stub with the
 * real cookie check). Every `/v1/conversations*` route is therefore
 * permanently bound to the pre-E02-S032 deny-by-default stub and 401s for
 * EVERY caller, real session or not. This is a pre-existing bug, unrelated
 * to CSRF, outside E04-S048's allowed-modify list to fix (`server.ts`'s
 * registration order / `services/conversation/src/plugin-types.ts`).
 * `services/model-gateway` (registered AFTER identityPlugin) does not have
 * this problem — confirmed, not assumed; see the route-scan results below.
 *
 * Until it is fixed, these routes cannot be used to positively prove "CSRF
 * passes a request through once the header is supplied" (they 401 either
 * way right now) — only that they reject an uncredentialed request, which
 * they do, just not for the CSRF-specific reason. Documenting this
 * precisely rather than silently asserting something unverifiable.
 */
function isBlockedByThePreExistingAuthBug(route: RouteEntry): boolean {
  return route.path.startsWith("/v1/conversations");
}

describe("E04-S048 AC5 — every real state-changing route enforces CSRF (route-table scan, not a checklist)", () => {
  it("finds at least the state-changing routes this story's EVIDENCE documents (sanity: the scan itself is not empty)", async () => {
    const instance = await buildRealServer();
    const routes = await discoverStateChangingRoutes(instance);
    // Not an exhaustive equality check (that WOULD be a checklist) — just
    // proof the scan actually discovered a non-trivial route set, so a
    // parser bug that silently returns [] cannot make every test below
    // vacuously pass.
    expect(routes.length).toBeGreaterThanOrEqual(6);
    expect(routes.some((r) => r.path === "/v1/auth/login")).toBe(true);
    expect(routes.some((r) => r.path.includes("/conversations"))).toBe(true);
    expect(routes.some((r) => r.path === "/v1/transcriptions")).toBe(true);
  });

  it("EVERY discovered state-changing route rejects a cross-site-shaped request (valid session cookie, no CSRF credentials) — 403 CSRF_HEADER_MISSING where the pre-existing auth bug does not mask it, otherwise still a hard deny (401)", async () => {
    const instance = await buildRealServer();
    const cookie = await loginAndGetCookie(instance);
    const routes = await discoverStateChangingRoutes(instance);

    const failures: string[] = [];
    for (const route of routes) {
      const res = await instance.inject({
        method: route.method as "POST",
        url: fillParams(route.path),
        cookies: { ai_km_session: cookie },
        payload: payloadFor(route),
        // No x-requested-with, no Origin, no Referer — exactly what a
        // malicious cross-site <form> submission looks like: the browser
        // attaches the cookie automatically but cannot set a custom header
        // or spoof these navigation-driven headers to match this origin.
      });
      let code: unknown;
      try {
        code = res.json().code;
      } catch {
        code = undefined;
      }

      if (isBlockedByThePreExistingAuthBug(route)) {
        // Still must be a hard deny — just not necessarily FOR the CSRF
        // reason, since these routes' requireSession is the stale
        // pre-identityPlugin stub (see isBlockedByThePreExistingAuthBug's
        // docstring), which denies everything regardless of CSRF.
        if (res.statusCode >= 200 && res.statusCode < 300) {
          failures.push(`${route.method} ${route.path} -> ${res.statusCode} (SUCCEEDED without any credentials!)`);
        }
        continue;
      }

      if (res.statusCode !== 403 || code !== "CSRF_HEADER_MISSING") {
        failures.push(`${route.method} ${route.path} -> ${res.statusCode} ${JSON.stringify(code)}`);
      }
    }

    expect(failures, `these routes did NOT reject a cross-site request:\n${failures.join("\n")}`).toEqual([]);
  });

  it("the SAME routes are NOT blocked by CSRF once the credential is supplied (non-vacuity: proves the check is not a blanket 403) — skipped for routes the pre-existing auth bug always denies regardless", async () => {
    const instance = await buildRealServer();
    const cookie = await loginAndGetCookie(instance);
    const routes = await discoverStateChangingRoutes(instance).then((rs) =>
      rs.filter((r) => !isBlockedByThePreExistingAuthBug(r)),
    );
    // Non-vacuity: prove the filter above did not just remove everything.
    expect(routes.length).toBeGreaterThan(0);

    for (const route of routes) {
      const res = await instance.inject({
        method: route.method as "POST",
        url: fillParams(route.path),
        cookies: { ai_km_session: cookie },
        payload: payloadFor(route),
        headers: { "x-requested-with": "XMLHttpRequest" },
      });
      let code: unknown;
      try {
        code = res.json().code;
      } catch {
        code = undefined;
      }
      expect(code, `${route.method} ${route.path} was still blocked by CSRF with the header present`).not.toBe(
        "CSRF_HEADER_MISSING",
      );
    }
  });

  it("GET routes are completely unaffected — no header needed at all (red line, checked against the real route table)", async () => {
    const instance = await buildRealServer();
    const cookie = await loginAndGetCookie(instance);
    const printed = instance.printRoutes({ commonPrefix: false });
    const getRoutes = parseFastifyRoutes(printed).filter((r) => r.method === "GET" && !r.path.includes(":"));

    expect(getRoutes.length).toBeGreaterThan(0);
    for (const route of getRoutes) {
      const res = await instance.inject({ method: "GET", url: route.path, cookies: { ai_km_session: cookie } });
      let code: unknown;
      try {
        code = res.json().code;
      } catch {
        code = undefined;
      }
      expect(code, `${route.method} ${route.path} was blocked by CSRF`).not.toBe("CSRF_HEADER_MISSING");
    }
  });

  it("/v1/transcriptions (multipart) rejects a request with neither Origin nor Referer, even with a valid session", async () => {
    const instance = await buildRealServer();
    const cookie = await loginAndGetCookie(instance);

    const res = await instance.inject({
      method: "POST",
      url: "/v1/transcriptions",
      cookies: { ai_km_session: cookie },
      headers: { "content-type": "multipart/form-data; boundary=x" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_HEADER_MISSING");
  });

  it("/v1/transcriptions accepts a loopback Origin (the CSRF layer passes it through to the route's own body handling)", async () => {
    const instance = await buildRealServer();
    const cookie = await loginAndGetCookie(instance);

    const res = await instance.inject({
      method: "POST",
      url: "/v1/transcriptions",
      cookies: { ai_km_session: cookie },
      headers: { "content-type": "multipart/form-data; boundary=x", origin: "http://127.0.0.1:3000" },
    });
    // Not asserting 2xx — an empty/malformed multipart body legitimately
    // fails for OTHER reasons downstream. The only claim here is that CSRF
    // itself did not block it.
    let code: unknown;
    try {
      code = res.json().code;
    } catch {
      code = undefined;
    }
    expect(code).not.toBe("CSRF_HEADER_MISSING");
  });
});
