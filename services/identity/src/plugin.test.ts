import type { Database } from "better-sqlite3";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import cookiePlugin from "@fastify/cookie";
import { buildTestApp } from "./testing/app.js";
import { createTestDatabase } from "./testing/db.js";
import { validateAgainstAuthContract } from "./testing/contract.js";
import { findSessionWithUserByTokenHash } from "./repository.js";
import { hashSessionToken } from "./crypto.js";
import * as crypto from "./crypto.js";
import {
  _resetSandboxSeedersForTest,
  registerSandboxSeeder,
} from "./sandbox-seeders.js";
import { identityPlugin } from "./plugin.js";
import { requireAnyRole } from "./require-session.js";

// E04-S086: this file's ~51 `build()` calls each provision `seedDemoUsers`
// (10 accounts, repository.ts) and every login pays crypto.ts's
// `verifyPassword` — deliberately a real scrypt computation (N=2**14) even
// for an unknown user (AC2's constant-time requirement; DUMMY_SALT/
// dummyHash below). Measured directly on a real CI run (33776314632, a
// throwaway probe branch, deleted after use — see archive/stories/PROGRESS.md's
// E04-S086 row for the full numbers): a SINGLE `build()` + ONE login took
// 3919ms + 352ms wall-clock on that runner (loadavg ~14 on 4 vCPUs — turbo
// runs every workspace package's tests in parallel, so this is CPU
// contention, not a slower scrypt) — enough on its own to sit on vitest's
// 5000ms default. E02-S035 fixed the one test that was actually observed
// failing (rewriting IT alone), but every other `build()` in this file pays
// the identical fixed cost and was equally exposed to the same runner
// variance — a class problem, not a single flaky test.
//
// FIX: replace crypto.ts's hashPassword/verifyPassword/dummyHash, for THIS
// TEST FILE ONLY, with a cheap SHA-256-based stand-in that preserves the
// exact same true/false semantics (correct password matches, wrong password
// and unknown username do not) — nothing this file asserts on inspects hash
// bytes or the scrypt algorithm itself (that coverage is crypto.test.ts,
// untouched, still exercising the real scrypt path); every assertion here
// is about the login ROUTE'S decision (status code, error code, cookie,
// log line), which only depends on verifyPassword's boolean answer, not on
// how expensively it is computed. `crypto.ts` itself, its N/r/p parameters,
// and the constant-time PRODUCTION behaviour are untouched — this `vi.mock`
// only changes what this file's own module graph resolves "./crypto.js" to;
// other test files (crypto.test.ts, repository.test.ts, require-session.
// test.ts) get their own isolated module registry per vitest's default
// per-file isolation and are unaffected.
//
// vi.mock (not per-call vi.spyOn as the E02-S035 AC3 test used locally)
// specifically so that AC3's own `vi.spyOn(crypto, "verifyPassword")
// .mockResolvedValue(false)` / `.mockRestore()` pair — which predates this
// fix and is left as-is below — restores to THIS fast stand-in afterward,
// not to the real (slow) crypto.ts implementation: `vi.spyOn` on an
// already-mocked export re-wraps the CURRENT value, and `.mockRestore()`
// on that wrapper puts back whatever was current at spy-creation time, not
// the module's original pre-`vi.mock` implementation.
vi.mock("./crypto.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./crypto.js")>();

  function fastHashHex(password: string, saltHex: string): string {
    return createHash("sha256").update(`${saltHex}:${password}`, "utf8").digest("hex");
  }

  const fastDummyHash = fastHashHex(
    "ai-km-constant-time-placeholder",
    actual.DUMMY_SALT,
  );

  return {
    ...actual,
    async hashPassword(password: string) {
      const salt = randomBytes(32).toString("hex");
      return { hash: fastHashHex(password, salt), salt };
    },
    async verifyPassword(
      password: string,
      saltHex: string,
      expectedHashHex: string,
    ) {
      const actualBuf = Buffer.from(fastHashHex(password, saltHex), "hex");
      const expectedBuf = Buffer.from(expectedHashHex, "hex");
      return (
        actualBuf.length === expectedBuf.length &&
        timingSafeEqual(actualBuf, expectedBuf)
      );
    },
    async dummyHash() {
      return fastDummyHash;
    },
  };
});

let harness: Awaited<ReturnType<typeof buildTestApp>> | undefined;

async function build(env: Record<string, string> = {}) {
  harness = await buildTestApp(env);
  return harness;
}

/** Captures pino NDJSON output for assertions (mirrors apps/api/src/server.test.ts's LogSink). */
class LogSink {
  lines: Record<string, unknown>[] = [];
  raw = "";
  write(chunk: string): boolean {
    this.raw += chunk;
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue;
      try {
        this.lines.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* pino only ever writes NDJSON here */
      }
    }
    return true;
  }
}

async function buildWithLogSink(
  env: Record<string, string> = {},
): Promise<{
  harness: Awaited<ReturnType<typeof buildTestApp>>;
  sink: LogSink;
}> {
  const sink = new LogSink();
  const built = await buildTestApp(env, { loggerStream: sink });
  harness = built;
  return { harness: built, sink };
}

function setCookieHeader(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw.join("\n") : String(raw ?? "");
}

function sessionCookieFrom(res: { headers: Record<string, unknown> }): string {
  const match = setCookieHeader(res).match(/ai_km_session=([^;]+)/);
  if (!match?.[1]) throw new Error("no ai_km_session cookie in response");
  return match[1];
}

afterEach(async () => {
  await harness?.app.close();
  harness = undefined;
  _resetSandboxSeedersForTest();
});

describe("POST /v1/auth/login (AC1, AC2, AC3)", () => {
  it("200s with the demo account's fields, field-for-field, and never a token", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      userId: "mock-user-1",
      roles: ["general_user"],
      expiresAt: expect.any(String),
      name: "示範使用者",
      email: "demo-user@example.com",
      department: "資訊部",
      group: "一般使用者群組",
    });
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("sets an HttpOnly, SameSite=Lax, Path=/ cookie without Secure over plain HTTP", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookieHeader = setCookieHeader(res);
    expect(cookieHeader).toMatch(/ai_km_session=/);
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Lax/i);
    expect(cookieHeader).toMatch(/Path=\//);
    expect(cookieHeader).not.toMatch(/Secure/i);
  });

  it("adds Secure when the request arrived over HTTPS (x-forwarded-proto)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: {
        "x-requested-with": "XMLHttpRequest",
        "x-forwarded-proto": "https",
      },
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(setCookieHeader(res)).toMatch(/Secure/i);
  });

  it("401s with INVALID_CREDENTIALS for a wrong password", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("401s with the SAME code for an unknown username (no account enumeration)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "no-such-user", password: "anything" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("does not set a session cookie on a failed login", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "wrong-password" },
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("403s with ACCOUNT_DISABLED for the disabled demo account with the correct password", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "disabled", password: "demo-pass-123" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("ACCOUNT_DISABLED");
  });

  it("401s (not 403) for the disabled account with a WRONG password — disabled stays hidden until the password is proven correct", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "disabled", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("400s on a body missing password (contract-bound validation)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("400s on an unexpected extra field (contract additionalProperties: false)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: {
        username: "demo-user",
        password: "demo-pass-123",
        role: "admin",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("the 200 body satisfies contracts/openapi/auth.yaml's AuthSession schema", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const result = await validateAgainstAuthContract(
      "/auth/login",
      "post",
      200,
      res.json(),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("the 401 body satisfies auth.yaml's InvalidCredentialsBody schema", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "wrong" },
    });
    const result = await validateAgainstAuthContract(
      "/auth/login",
      "post",
      401,
      res.json(),
    );
    expect(result.valid).toBe(true);
  });

  it("the 403 body satisfies auth.yaml's AccountDisabledBody schema", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "disabled", password: "demo-pass-123" },
    });
    const result = await validateAgainstAuthContract(
      "/auth/login",
      "post",
      403,
      res.json(),
    );
    expect(result.valid).toBe(true);
  });
});

describe("Dev trigger (AC6)", () => {
  it("503s SERVICE_UNAVAILABLE for username service-error when AI_KM_DEV_TRIGGERS=true", async () => {
    const { app } = await build({ AI_KM_DEV_TRIGGERS: "true" });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "service-error", password: "anything" },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe("SERVICE_UNAVAILABLE");
  });

  it("the 503 body satisfies auth.yaml's ServiceUnavailableBody schema", async () => {
    const { app } = await build({ AI_KM_DEV_TRIGGERS: "true" });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "service-error", password: "anything" },
    });
    const result = await validateAgainstAuthContract(
      "/auth/login",
      "post",
      503,
      res.json(),
    );
    expect(result.valid).toBe(true);
  });

  it("falls through to the normal (401) path for service-error when the flag is off", async () => {
    const { app } = await build({ AI_KM_DEV_TRIGGERS: "false" });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "service-error", password: "anything" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("INVALID_CREDENTIALS");
  });
});

describe("Test sandbox (AC7)", () => {
  it("gives two logins of the same account two different sandbox ownerKeys, both prefixed userId:sbx:", async () => {
    const { app, db } = await build({ AI_KM_TEST_SANDBOX: "true" });
    const first = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const second = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const firstOwner = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(sessionCookieFrom(first)),
    )?.owner_key;
    const secondOwner = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(sessionCookieFrom(second)),
    )?.owner_key;
    expect(firstOwner).toMatch(/^mock-user-1:sbx:/);
    expect(secondOwner).toMatch(/^mock-user-1:sbx:/);
    expect(firstOwner).not.toBe(secondOwner);
  });

  it("still reports the real userId in the login response body under sandbox mode", async () => {
    const { app } = await build({ AI_KM_TEST_SANDBOX: "true" });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(res.json().userId).toBe("mock-user-1");
  });

  it("calls each registered sandbox seeder once per login, with that login's ownerKey", async () => {
    const seeder = vi.fn();
    registerSandboxSeeder(seeder);
    const { app, db } = await build({ AI_KM_TEST_SANDBOX: "true" });

    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const ownerKey = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(sessionCookieFrom(res)),
    )?.owner_key;

    expect(seeder).toHaveBeenCalledTimes(1);
    expect(seeder).toHaveBeenCalledWith(ownerKey);
  });

  it("uses ownerKey === userId and never calls a seeder when the sandbox flag is off", async () => {
    const seeder = vi.fn();
    registerSandboxSeeder(seeder);
    const { app, db } = await build({ AI_KM_TEST_SANDBOX: "false" });

    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const ownerKey = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(sessionCookieFrom(res)),
    )?.owner_key;

    expect(ownerKey).toBe("mock-user-1");
    expect(seeder).not.toHaveBeenCalled();
  });
});

describe("GET /v1/auth/session (AC4)", () => {
  it("200s for a valid cookie and advances last_seen_at", async () => {
    const { app, db } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookie = sessionCookieFrom(login);
    const before = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(cookie),
    )?.last_seen_at;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { ai_km_session: cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe("mock-user-1");
    const after = findSessionWithUserByTokenHash(
      db,
      hashSessionToken(cookie),
    )?.last_seen_at;
    expect(Date.parse(after!)).toBeGreaterThan(Date.parse(before!));
  });

  it("the 200 body satisfies auth.yaml's AuthSession schema", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });
    const result = await validateAgainstAuthContract(
      "/auth/session",
      "get",
      200,
      res.json(),
    );
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("401s with no cookie", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/auth/session" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHENTICATED");
  });

  it("401s and clears the cookie for a tampered cookie value", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { ai_km_session: "not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
    expect(setCookieHeader(res)).toMatch(/ai_km_session=;/);
  });

  it("the 401 body satisfies auth.yaml's UnauthenticatedBody schema", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/auth/session" });
    const result = await validateAgainstAuthContract(
      "/auth/session",
      "get",
      401,
      res.json(),
    );
    expect(result.valid).toBe(true);
  });
});

describe("POST /v1/auth/logout (AC5)", () => {
  it("204s, deletes the session, and the same cookie then 401s", async () => {
    const { app, db } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookie = sessionCookieFrom(login);

    const logout = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.body).toBe("");
    expect(
      findSessionWithUserByTokenHash(db, hashSessionToken(cookie)),
    ).toBeUndefined();

    const sessionAfter = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { ai_km_session: cookie },
    });
    expect(sessionAfter.statusCode).toBe(401);
  });

  it("clears the cookie", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });
    expect(setCookieHeader(res)).toMatch(/ai_km_session=;/);
  });

  it("204s idempotently with no cookie at all", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
    });
    expect(res.statusCode).toBe(204);
  });

  it("204s idempotently for an already-logged-out cookie", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookie = sessionCookieFrom(login);
    await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: cookie },
    });
    const second = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: cookie },
    });
    expect(second.statusCode).toBe(204);
  });
});

describe("AC9 — a protected route denies with 401 and never runs the handler when requireSession fails", () => {
  // Fastify refuses to add routes after `.ready()`, and buildTestApp() calls
  // it — so these two build their own bare instance + identityPlugin and add
  // the test route BEFORE booting, instead of using buildTestApp().
  let app: FastifyInstance;
  let db: Database;

  afterEach(async () => {
    await app?.close();
  });

  it("denies with no session and never reaches the handler", async () => {
    db = createTestDatabase();
    app = Fastify();
    await app.register(cookiePlugin);
    app.decorate("db", db);
    app.addHook("onClose", async () => db.close());
    await app.register(identityPlugin);

    const handler = vi.fn(async () => ({ ok: true }));
    app.get("/__protected__", { preHandler: app.requireSession }, handler);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/__protected__" });

    expect(res.statusCode).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("allows through and passes request.auth for a valid session", async () => {
    db = createTestDatabase();
    app = Fastify();
    await app.register(cookiePlugin);
    app.decorate("db", db);
    app.addHook("onClose", async () => db.close());
    await app.register(identityPlugin);

    app.get(
      "/__protected__",
      { preHandler: app.requireSession },
      async (request) => ({
        userId: request.auth?.userId,
        ownerKey: request.auth?.ownerKey,
      }),
    );
    await app.ready();

    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/__protected__",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      userId: "mock-user-1",
      ownerKey: "mock-user-1",
    });
  });
});

describe("AC8 — seeding is idempotent across a restart against the same database", () => {
  it("does not duplicate users when a second server starts against the same db", async () => {
    // `db` is `:memory:` — closing its connection would destroy the data, so
    // "restart" here means booting a SECOND, independent Fastify instance
    // against the SAME still-open database handle, not actually closing and
    // reopening anything (that is what a file-backed DB restart would mean;
    // `:memory:` has no file to reopen).
    const { app: first, db } = await build();
    await first.ready(); // make sure the FIRST boot's seeding has actually run

    const second = Fastify();
    await second.register(cookiePlugin);
    second.decorate("db", db);
    await second.register(identityPlugin);
    await second.ready();

    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }
    ).n;
    expect(count).toBe(10); // 4 (E02-S032) + 6 admin accounts (E02-S033)

    await second.close();
    // `harness` (= first) is closed by the afterEach hook, which also closes `db`.
  });
});

describe("no dependency on apps/api's own contract/error-envelope machinery", () => {
  it("smoke: the plugin builds and answers requests using only its own devDependencies", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/auth/session" });
    expect(res.statusCode).toBe(401);
  });
});

describe("E02-S033 AC2 — requireAnyRole chained after app.requireSession, through the full plugin", () => {
  let db: Database;
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  async function buildGuardedApp(): Promise<FastifyInstance> {
    db = createTestDatabase();
    app = Fastify();
    await app.register(cookiePlugin);
    app.decorate("db", db);
    app.addHook("onClose", async () => db.close());
    await app.register(identityPlugin);
    app.get(
      "/__audit__",
      { preHandler: [app.requireSession, requireAnyRole(["auditor"])] },
      async () => ({ ok: true }),
    );
    await app.ready();
    return app;
  }

  async function loginAs(
    instance: FastifyInstance,
    username: string,
  ): Promise<string> {
    const res = await instance.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username, password: "demo-pass-123" },
    });
    const match = String(res.headers["set-cookie"]).match(
      /ai_km_session=([^;]+)/,
    );
    if (!match?.[1]) throw new Error("login did not set a session cookie");
    return match[1];
  }

  it("200s for demo-auditor", async () => {
    const instance = await buildGuardedApp();
    const cookieValue = await loginAs(instance, "demo-auditor");
    const res = await instance.inject({
      method: "GET",
      url: "/__audit__",
      cookies: { ai_km_session: cookieValue },
    });
    expect(res.statusCode).toBe(200);
  });

  it("403s for demo-user", async () => {
    const instance = await buildGuardedApp();
    const cookieValue = await loginAs(instance, "demo-user");
    const res = await instance.inject({
      method: "GET",
      url: "/__audit__",
      cookies: { ai_km_session: cookieValue },
    });
    expect(res.statusCode).toBe(403);
  });

  it("401s when not logged in", async () => {
    const instance = await buildGuardedApp();
    const res = await instance.inject({ method: "GET", url: "/__audit__" });
    expect(res.statusCode).toBe(401);
  });

  it("200s for demo-super (implicit super_administrator pass)", async () => {
    const instance = await buildGuardedApp();
    const cookieValue = await loginAs(instance, "demo-super");
    const res = await instance.inject({
      method: "GET",
      url: "/__audit__",
      cookies: { ai_km_session: cookieValue },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("E02-S033 AC4 — AI_KM_SESSION_COOKIE_DOMAIN, end to end through login/logout", () => {
  it("login's Set-Cookie carries Domain when configured", async () => {
    const { app } = await build({
      AI_KM_SESSION_COOKIE_DOMAIN: "example.internal",
    });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(setCookieHeader(res)).toMatch(/Domain=example\.internal/i);
  });

  it("login's Set-Cookie has no Domain when unset", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(setCookieHeader(res)).not.toMatch(/Domain=/i);
  });

  it("logout's clearing Set-Cookie ALSO carries the same Domain (otherwise a browser would not actually delete it)", async () => {
    const { app } = await build({
      AI_KM_SESSION_COOKIE_DOMAIN: "example.internal",
    });
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });
    expect(setCookieHeader(res)).toMatch(/Domain=example\.internal/i);
  });
});

describe("E02-S034 — login rate limiting and account lockout", () => {
  async function login(
    app: FastifyInstance,
    username: string,
    password: string,
    remoteAddress = "203.0.113.50",
  ) {
    return app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username, password },
      remoteAddress,
    });
  }

  it("AC1: the 6th attempt (default threshold) locks even with the CORRECT password, and is byte-identical to a wrong-password 401", async () => {
    const { app } = await build();
    for (let i = 0; i < 5; i += 1) {
      await login(app, "demo-user", "wrong-password", "198.51.100.1");
    }
    const locked = await login(
      app,
      "demo-user",
      "demo-pass-123",
      "198.51.100.1",
    );
    const wrongPassword = await login(
      app,
      "demo-user",
      "wrong-password-2",
      "198.51.100.1",
    );

    expect(locked.statusCode).toBe(401);
    expect(locked.statusCode).toBe(wrongPassword.statusCode);
    expect(locked.body).toBe(wrongPassword.body);
    expect(locked.json().code).toBe("INVALID_CREDENTIALS");
  });

  it("AC1/AC7: a low AI_KM_LOGIN_RATE_LIMIT threshold locks after fewer attempts", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:2",
    });
    await login(app, "demo-user", "wrong", "198.51.100.2");
    await login(app, "demo-user", "wrong", "198.51.100.2");
    const res = await login(app, "demo-user", "demo-pass-123", "198.51.100.2");
    expect(res.statusCode).toBe(401);
  });

  it("does not lock a username that has fewer failures than the threshold", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:3",
    });
    await login(app, "demo-user", "wrong", "198.51.100.3");
    await login(app, "demo-user", "wrong", "198.51.100.3");
    const res = await login(app, "demo-user", "demo-pass-123", "198.51.100.3");
    expect(res.statusCode).toBe(200);
  });

  it("AC2: once the failures fall outside the window, the correct password succeeds again", async () => {
    const { app, db } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:2",
    });
    await login(app, "demo-user", "wrong", "198.51.100.4");
    await login(app, "demo-user", "wrong", "198.51.100.4");
    const stillLocked = await login(
      app,
      "demo-user",
      "demo-pass-123",
      "198.51.100.4",
    );
    expect(stillLocked.statusCode).toBe(401);

    // "Test 以可注入時鐘推進" — implemented here by rewriting the recorded
    // attempts' timestamps to 20 minutes in the past (outside the default
    // 15-minute window) rather than threading a clock through production
    // code; see archive/stories/E02-S034.md's Assumptions for why.
    db.prepare(
      "UPDATE login_attempts SET attempted_at = ? WHERE username = 'demo-user'",
    ).run(new Date(Date.now() - 20 * 60 * 1000).toISOString());

    const res = await login(app, "demo-user", "demo-pass-123", "198.51.100.4");
    expect(res.statusCode).toBe(200);
  });

  it("AC3: 20 different accounts each failing once from the SAME IP locks the 21st attempt, even for a brand-new username", async () => {
    // E02-S035 (CI flake fix — root cause corrected from an earlier draft
    // of this comment that blamed generic CI-runner load; see the CI log
    // evidence below for why that was incomplete).
    //
    // ROOT CAUSE: this test's cost is LINEAR in its attempt count against a
    // CONSTANT timeout. It runs 21 sequential logins, and every one — success
    // or failure, real user or not — unconditionally pays for a real scrypt
    // computation (crypto.ts's verifyPassword, N=2**14; the "always hash,
    // even for an unknown user" behaviour is deliberate, for AC2's
    // constant-time requirement — not something this fix may remove from
    // production). The sibling tests in this same describe block do 3-7
    // logins each and finish comfortably under budget; this one does 21 and
    // was, by construction, sitting right on top of vitest's 5000ms default.
    //
    // Measured directly from a real failing CI run (main, run 33709974731,
    // commit 07728f3 — the exact HEAD this branch forked from):
    //   AC3 (21 logins):                         5052ms → "Test timed out in 5000ms"
    //   AC1 (7 logins, same file, same run):      2584ms
    //   AC2 (4 logins):                           1890ms
    //   "does not lock below threshold" (3):      1977ms
    //   AC1/AC7 (3 logins):                       1631ms
    //   AC3/AC7 (4 logins):                       1474ms
    // All five siblings passed in the SAME run AC3 failed in. If the cause
    // were runner-wide load, all six would have slowed down together — they
    // did not. Only the one whose cost scales with 21 real hashes, not 3-7,
    // was anywhere near the line. main's job history over the same window
    // (success/success/failure/success/success/failure across 7 runs, every
    // failure `lint-typecheck-unit` with `e2e`/`contract-gate` green every
    // time) is consistent with a test parked on a boundary that ordinary
    // runner-speed variance crosses roughly half the time — not with an
    // occasional external load spike. (CPU contention — reproduced earlier
    // by pinning this process to one core under ~60 concurrent
    // `yes > /dev/null` — still makes it worse on top of this; it's a real
    // secondary amplifier, just not the reason the test sits on the line to
    // begin with.)
    //
    // FIX: reduce the fixed-and-per-attempt cost, not the attempt count (21
    // distinct accounts is what AC3 is about) and not the timeout constant
    // (raising it only postpones the next occurrence to a slightly slower
    // runner or a slightly larger perIpMaxFailures). AI_KM_SEED_DEMO_USERS:
    // false skips the 10 real scrypt calls seedDemoUsers would otherwise do
    // on every build() for accounts this test never logs into. Stubbing
    // verifyPassword removes the 21 real per-login computations entirely —
    // this does not touch what's under test: the throttle decision reads the
    // failure counters (countRecentFailuresByIp/Username in plugin.ts), not
    // passwordOk, so a broken rate limiter still fails this test exactly as
    // before (see reverse verification below). AC3/AC7 already uses the
    // OTHER legitimate lever this file accepts — fewer attempts
    // (perIpMaxFailures:3, 4 logins, 1474ms) — proving the same property;
    // removing the per-login cost here is the same kind of move, applied to
    // the one AC that specifically needs 20+1 distinct accounts to make its
    // point ("even for a brand-new username").
    //
    // While reverse-verifying this fix, the ORIGINAL assertion
    // (`res.statusCode === 401`) turned out to already be a blind spot,
    // unrelated to the flake: the final request uses a brand-new,
    // never-seen username on purpose (that's the point of this test — a
    // never-seen username still gets IP-throttled), but an unknown username
    // *always* 401s via the ordinary invalid-credentials branch too
    // (`if (!user || !passwordOk)`), byte-identical to the throttled
    // response by AC1/AC5 design. So disabling throttling entirely left
    // this test GREEN — it was asserting "a response happened", not "it was
    // the throttle that rejected it". Fixed the same way the neighbouring
    // "telemetry" describe block below already discriminates the two:
    // asserting on the LOGIN_RATE_LIMITED log line, which plugin.ts only
    // emits from the `throttled` branch. Because verifyPassword is stubbed,
    // this whole test now runs in well under a second, so a mutation that
    // breaks the throttle shows up as THIS assertion failing on content —
    // not as a second timeout race (see reverse verification below).
    const verifySpy = vi
      .spyOn(crypto, "verifyPassword")
      .mockResolvedValue(false);
    try {
      const { harness, sink } = await buildWithLogSink({
        AI_KM_LOGIN_RATE_LIMIT: "perIpMaxFailures:20",
        AI_KM_SEED_DEMO_USERS: "false",
      });
      const { app } = harness;
      const ip = "198.51.100.5";
      for (let i = 0; i < 20; i += 1) {
        await login(app, `nonexistent-user-${i}`, "wrong", ip);
      }
      const res = await login(
        app,
        "brand-new-never-seen-username",
        "anything",
        ip,
      );
      expect(res.statusCode).toBe(401);
      const rateLimitEvents = sink.lines.filter(
        (l) => l.code === "LOGIN_RATE_LIMITED",
      );
      // Custom message (not just toHaveLength's default) so the decisive
      // fact — a LOGIN_RATE_LIMITED rejection, specifically — is IN the
      // failure text, not just visible in a diff a mutation-testing tool
      // can't see into.
      expect(
        rateLimitEvents.length,
        `expected exactly one LOGIN_RATE_LIMITED rejection for the 21st attempt, got ${rateLimitEvents.length}`,
      ).toBe(1);
    } finally {
      verifySpy.mockRestore();
    }
  });

  it("AC3/AC7: a low perIpMaxFailures locks the IP after fewer distinct-account failures", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perIpMaxFailures:3",
    });
    const ip = "198.51.100.6";
    await login(app, "u1", "wrong", ip);
    await login(app, "u2", "wrong", ip);
    await login(app, "u3", "wrong", ip);
    const res = await login(app, "demo-user", "demo-pass-123", ip); // correct password, still IP-locked
    expect(res.statusCode).toBe(401);
  });

  it("a different IP is not affected by another IP's failures", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perIpMaxFailures:2",
    });
    await login(app, "u1", "wrong", "198.51.100.7");
    await login(app, "u2", "wrong", "198.51.100.7");
    const res = await login(app, "demo-user", "demo-pass-123", "198.51.100.8");
    expect(res.statusCode).toBe(200);
  });

  it("AC4: a successful login resets that username's failure count but not the IP's", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:2, perIpMaxFailures:100",
    });
    const ip = "198.51.100.9";
    await login(app, "demo-user", "wrong", ip);
    const success = await login(app, "demo-user", "demo-pass-123", ip);
    expect(success.statusCode).toBe(200);

    // The username's own count is back to 0, so 2 MORE failures are needed
    // before it locks again — not "already at 1 from before the success".
    await login(app, "demo-user", "wrong", ip);
    const stillOk = await login(app, "demo-user", "demo-pass-123", ip);
    expect(stillOk.statusCode).toBe(200);
  });

  it("AC5: the locked response never differs from INVALID_CREDENTIALS in any observable field", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:1",
    });
    const ip = "198.51.100.10";
    await login(app, "demo-user", "wrong", ip);
    const res = await login(app, "demo-user", "demo-pass-123", ip);
    const result = await validateAgainstAuthContract(
      "/auth/login",
      "post",
      401,
      res.json(),
    );
    expect(result.valid).toBe(true);
    expect(Object.keys(res.json())).toEqual(["code", "message"]);
  });

  it("regression: a locked response must stay indistinguishable from a wrong-password response (permanent — do not special-case lockout)", async () => {
    const { app } = await build({
      AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:1",
    });
    const ip = "198.51.100.11";
    const wrongPasswordBaseline = await login(
      app,
      "someone-never-locked",
      "wrong",
      "198.51.100.12",
    );
    await login(app, "demo-user", "wrong", ip);
    const locked = await login(app, "demo-user", "demo-pass-123", ip);
    expect(locked.statusCode).toBe(wrongPasswordBaseline.statusCode);
    expect(locked.json()).toEqual(wrongPasswordBaseline.json());
  });

  it("AC6: the startup sweep removes login_attempts rows older than 24h", async () => {
    const db = createTestDatabase();
    db.prepare(
      "INSERT INTO login_attempts (id, username, ip, succeeded, attempted_at) VALUES ('old-1','u','1.2.3.4',0,?)",
    ).run(new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString());
    db.prepare(
      "INSERT INTO login_attempts (id, username, ip, succeeded, attempted_at) VALUES ('recent-1','u','1.2.3.4',0,?)",
    ).run(new Date().toISOString());

    const app = Fastify();
    await app.register(cookiePlugin);
    app.decorate("db", db);
    app.addHook("onClose", async () => db.close());
    await app.register(identityPlugin);
    await app.ready();

    const remaining = db.prepare("SELECT id FROM login_attempts").all() as {
      id: string;
    }[];
    expect(remaining.map((r) => r.id)).toEqual(["recent-1"]);

    await app.close();
  });

  it("does not throttle an account with no prior attempts at all", async () => {
    const { app } = await build();
    const res = await login(app, "demo-user", "demo-pass-123", "198.51.100.13");
    expect(res.statusCode).toBe(200);
  });

  describe("telemetry (E02-S034 技術決策: LOGIN_RATE_LIMITED, metadata only)", () => {
    it("logs a LOGIN_RATE_LIMITED event when a request is throttled", async () => {
      const { harness, sink } = await buildWithLogSink({
        AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:1",
      });
      const ip = "198.51.100.20";
      await login(harness.app, "demo-user", "wrong", ip);
      await login(harness.app, "demo-user", "demo-pass-123", ip);

      const event = sink.lines.find((l) => l.code === "LOGIN_RATE_LIMITED");
      expect(event).toBeDefined();
      expect(event?.ip).toBe(ip);
      expect(typeof event?.usernameHash).toBe("string");
      expect(event?.usernameFailures).toBeGreaterThanOrEqual(1);
    });

    it("never logs the raw username or the password anywhere", async () => {
      const { harness, sink } = await buildWithLogSink({
        AI_KM_LOGIN_RATE_LIMIT: "perUsernameMaxFailures:1",
      });
      const ip = "198.51.100.21";
      await login(
        harness.app,
        "demo-user",
        "wrong-password-should-not-leak",
        ip,
      );
      await login(harness.app, "demo-user", "demo-pass-123", ip);

      expect(sink.raw).not.toContain("wrong-password-should-not-leak");
      expect(sink.raw).not.toContain("demo-pass-123");
      // The raw username itself must not appear either — only its hash.
      const event = sink.lines.find((l) => l.code === "LOGIN_RATE_LIMITED") as
        { usernameHash?: string } | undefined;
      expect(event?.usernameHash).not.toBe("demo-user");
      expect(sink.raw).not.toMatch(/"username":"demo-user"/);
    });

    it("does not log LOGIN_RATE_LIMITED for a normal (non-throttled) wrong-password attempt", async () => {
      const { harness, sink } = await buildWithLogSink();
      await login(harness.app, "demo-user", "wrong", "198.51.100.22");

      expect(
        sink.lines.find((l) => l.code === "LOGIN_RATE_LIMITED"),
      ).toBeUndefined();
    });
  });
});

describe("E04-S048 — CSRF: login/logout require x-requested-with (they never go through requireSession, so this is checked inline)", () => {
  it("POST /v1/auth/login WITHOUT x-requested-with is 403 CSRF_HEADER_MISSING, even with the correct password", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_HEADER_MISSING");
  });

  it("does not set a session cookie when the CSRF check denies the login", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("does not record a login_attempts row when denied for a missing CSRF header (never reached the throttle/credential logic)", async () => {
    const { app, db } = await build();
    await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const rows = db.prepare("SELECT COUNT(*) AS n FROM login_attempts").get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it("POST /v1/auth/login WITH x-requested-with succeeds normally (unaffected by CSRF)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("POST /v1/auth/logout WITHOUT x-requested-with is 403 CSRF_HEADER_MISSING, even with a valid session cookie", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookie = sessionCookieFrom(login);

    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      cookies: { ai_km_session: cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("CSRF_HEADER_MISSING");
  });

  it("a CSRF-denied logout does NOT delete the session — the victim stays logged in, exactly as if the attack had not happened", async () => {
    const { app, db } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const cookie = sessionCookieFrom(login);

    await app.inject({ method: "POST", url: "/v1/auth/logout", cookies: { ai_km_session: cookie } });

    expect(findSessionWithUserByTokenHash(db, hashSessionToken(cookie))).toBeDefined();
  });

  it("POST /v1/auth/logout WITH x-requested-with succeeds normally (unaffected by CSRF)", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/logout",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });
    expect(res.statusCode).toBe(204);
  });

  it("GET /v1/auth/session is completely unaffected — no header needed (red line: GET is never checked)", async () => {
    const { app } = await build();
    const login = await app.inject({
      method: "POST",
      headers: { "x-requested-with": "XMLHttpRequest" },
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/auth/session",
      cookies: { ai_km_session: sessionCookieFrom(login) },
    });
    expect(res.statusCode).toBe(200);
  });

  it("the 403 body satisfies the general Error envelope (code + message, nothing else)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { username: "demo-user", password: "demo-pass-123" },
    });
    expect(Object.keys(res.json()).sort()).toEqual(["code", "message"]);
  });
});
