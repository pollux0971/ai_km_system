import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { buildServer } from "./server.js";
import { ApiHttpError, ERROR_CODES } from "./errors.js";
import { loadConfig } from "./config.js";

const FIXTURES = path.dirname(fileURLToPath(import.meta.url)) + "/testing/fixtures";

/** Collects the pino output of one server so log assertions are possible. */
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

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function build(overrides: Record<string, string> = {}, sink?: LogSink) {
  const config = loadConfig({
    NODE_ENV: "test",
    // Quiet by default so a 68-test run does not bury real output in NDJSON.
    // Crucially NOT applied when a sink is present: silencing a server whose
    // logs are under assertion would turn "the secret is absent" into a
    // vacuous pass.
    ...(sink ? {} : { AI_KM_LOG_LEVEL: "silent" }),
    ...overrides,
  });
  app = await buildServer({ config, contractsDir: FIXTURES, loggerStream: sink });
  return app;
}

describe("GET /v1/health (AC1)", () => {
  it("returns 200 with status, version and uptimeMs", async () => {
    // E04-S047: this test's intent is "every subsystem healthy -> status
    // ok". The default config's asrProvider ("whisper-server", E04-S039's
    // fallback) genuinely has no reachable sidecar in this environment —
    // that is a true fact about this test's environment, not something to
    // paper over by loosening the assertion below. Fixing the PRECONDITION
    // (an explicit healthy ASR config) rather than the assertion keeps this
    // test proving what it always proved; see server.test.ts's own
    // "ASR down -> degraded" test right below for the other, equally real,
    // direction.
    const res = await (await build({ AI_KM_ASR_PROVIDER: "fake" })).inject({
      method: "GET",
      url: "/v1/health",
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(typeof body.uptimeMs).toBe("number");
    expect(body.uptimeMs).toBeGreaterThanOrEqual(0);
  });

  it("needs no session — it is an operations endpoint", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
  });

  it("leaks neither filesystem paths nor environment values", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    const raw = res.body;
    expect(raw).not.toContain("/data/");
    expect(raw).not.toContain("AI_KM_");
    expect(Object.keys(res.json()).sort()).toEqual(["status", "uptimeMs", "version"]);
  });

  it("echoes a correlation id header on the response", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    expect(res.headers["x-correlation-id"]).toBeTruthy();
  });

  it("AC1/AC3: reports status degraded when a subsystem (asr, unreachable whisper-server default) is down", async () => {
    // No AI_KM_ASR_PROVIDER override here — this is the default config's
    // genuinely-unreachable-sidecar case, the opposite side of the fix
    // above. Both directions are now locked by a real test.
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("degraded");
  });

  it("AC1's own literal example: status degraded when the database connection is closed", async () => {
    const server = await build({ AI_KM_ASR_PROVIDER: "fake" });
    server.db.close();
    const res = await server.inject({ method: "GET", url: "/v1/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("degraded");
  });

  it("stays 2xx even when degraded — every lane's E2E setup polls this with `curl -sf`, which fails on any non-2xx", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    expect(res.json().status).toBe("degraded"); // non-vacuity: this run genuinely is degraded
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
  });
});

describe("correlation id (AC2)", () => {
  it("reuses a supplied x-correlation-id", async () => {
    const res = await (await build()).inject({
      method: "GET",
      url: "/v1/health",
      headers: { "x-correlation-id": "abc" },
    });
    expect(res.headers["x-correlation-id"]).toBe("abc");
  });

  it("puts the supplied id on that request's log lines", async () => {
    const sink = new LogSink();
    await (await build({}, sink)).inject({
      method: "GET",
      url: "/v1/health",
      headers: { "x-correlation-id": "abc" },
    });
    expect(sink.lines.some((l) => l.correlationId === "abc")).toBe(true);
  });

  it("generates a uuid v4 when none is supplied", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/health" });
    expect(res.headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("gives two requests different generated ids", async () => {
    const server = await build();
    const a = await server.inject({ method: "GET", url: "/v1/health" });
    const b = await server.inject({ method: "GET", url: "/v1/health" });
    expect(a.headers["x-correlation-id"]).not.toBe(b.headers["x-correlation-id"]);
  });
});

describe("contract-bound request validation (AC3)", () => {
  it("rejects a body that violates the bound contract schema with 400 VALIDATION_ERROR", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      payload: { name: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });

  it("points details.issues[].path at the offending field", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      payload: { name: "ok", size: 99 },
    });
    expect(res.statusCode).toBe(400);
    const issues = res.json().details.issues as Array<{ path: string }>;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.path.includes("size"))).toBe(true);
  });

  it("does NOT echo the rejected input value back", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      payload: { name: "s3cr3t-value-do-not-echo" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain("s3cr3t-value-do-not-echo");
  });

  it("accepts a body that satisfies the contract", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      payload: { name: "widget", size: 3 },
    });
    expect(res.statusCode).toBe(201);
  });

  it("rejects an unexpected property, because the contract says additionalProperties: false", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      payload: { name: "widget", smuggled: "x" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("unexpected exceptions (AC4)", () => {
  it("becomes 500 INTERNAL_ERROR", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/__test__/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe(ERROR_CODES.INTERNAL_ERROR);
  });

  it("returns no stack, no file path and no original message", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/__test__/boom" });
    expect(res.body).not.toContain("at ");
    expect(res.body).not.toContain(".ts");
    expect(res.body).not.toContain("kaboom-internal-detail");
  });

  it("still logs the stack server-side, so the failure stays diagnosable", async () => {
    const sink = new LogSink();
    await (await build({}, sink)).inject({ method: "GET", url: "/v1/__test__/boom" });
    expect(sink.raw).toContain("kaboom-internal-detail");
  });

  it("passes an ApiHttpError through with its own code and status", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/__test__/conflict" });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe(ERROR_CODES.CONFLICT);
  });
});

describe("unknown route (AC5)", () => {
  it("is 404 NOT_FOUND in the same Error envelope", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/does-not-exist" });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND);
    expect(typeof body.message).toBe("string");
  });

  it("uses the envelope outside /v1 too", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe(ERROR_CODES.NOT_FOUND);
  });
});

describe("requireSession (AC8 / security-negative)", () => {
  it("fails closed with 401 UNAUTHENTICATED when no real provider has been registered", async () => {
    const res = await (await build()).inject({ method: "GET", url: "/v1/__test__/protected" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe(ERROR_CODES.UNAUTHENTICATED);
  });

  it("still denies when x-test-user is sent but the test provider is off", async () => {
    const server = await buildServer({
      config: loadConfig({ NODE_ENV: "development" }),
      contractsDir: FIXTURES,
      enableTestAuthProvider: false,
    });
    app = server;
    const res = await server.inject({
      method: "GET",
      url: "/v1/__test__/protected",
      headers: { "x-test-user": "u-1" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("accepts x-test-user only while the test provider is on", async () => {
    const server = await build();
    const res = await server.inject({
      method: "GET",
      url: "/v1/__test__/protected",
      headers: { "x-test-user": "u-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ userId: "u-1", ownerKey: "u-1" });
  });

  it("refuses to build a production server with the test auth provider enabled", async () => {
    await expect(
      buildServer({
        config: loadConfig({ NODE_ENV: "production" }),
        contractsDir: FIXTURES,
        enableTestAuthProvider: true,
      }),
    ).rejects.toThrow(/production/i);
  });
});

describe("logging hygiene (Security AC)", () => {
  it("logs neither cookie, nor authorization header, nor request body", async () => {
    const sink = new LogSink();
    const server = await build({}, sink);
    await server.inject({
      method: "POST",
      url: "/v1/__test__/widgets",
      headers: {
        cookie: "ai_km_session=super-secret-token",
        authorization: "Bearer super-secret-bearer",
      },
      payload: { name: "secret-body-value" },
    });
    // Non-vacuity guard: if logging were off, every assertion below would
    // pass for the wrong reason.
    expect(sink.lines.length).toBeGreaterThan(0);
    expect(sink.raw).toContain("/v1/__test__/widgets");

    expect(sink.raw).not.toContain("super-secret-token");
    expect(sink.raw).not.toContain("super-secret-bearer");
    expect(sink.raw).not.toContain("secret-body-value");
  });
});

describe("CORS (Security AC)", () => {
  it("is off by default — no allow-origin header is emitted", async () => {
    const res = await (await build()).inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows only origins on the configured allowlist", async () => {
    const server = await build({ AI_KM_CORS_ORIGINS: "https://good.example" });
    const ok = await server.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://good.example" },
    });
    expect(ok.headers["access-control-allow-origin"]).toBe("https://good.example");
    const bad = await server.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://evil.example" },
    });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("ApiHttpError is usable by downstream plugins", () => {
  it("is exported for E02-S032 / E04-S040+ to throw", () => {
    expect(new ApiHttpError(ERROR_CODES.PERMISSION_DENIED, 403, "無權限。").statusCode).toBe(403);
  });
});

describe("bootstrap order (E04-S049 AC1/AC2)", () => {
  it("makes app.contracts available at route-registration time, at the same point real domain plugins register", async () => {
    let sawSchema: unknown;
    const probePlugin: FastifyPluginAsync = async (probeApp) => {
      // Synchronous call during THIS plugin's own registration — this is
      // exactly what a domain route's `schema: { body: app.contracts
      // .getSchema(...) }` does. Before the E04-S049 fix, app.contracts was
      // still undefined here and this threw a TypeError.
      sawSchema = probeApp.contracts.getSchema("conversations", "Conversation");
    };

    const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
    app = await buildServer({ config, testExtraPlugin: probePlugin });

    expect(sawSchema).toBeDefined();
  });
});
