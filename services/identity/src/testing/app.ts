/**
 * Test-only helper: a bare Fastify instance with `@fastify/cookie`, a fresh
 * in-memory `db` (real migration applied), and `identityPlugin` registered —
 * the smallest harness that exercises this story's routes end to end without
 * pulling in apps/api (see plugin.ts's docstring for why that dependency
 * direction is wrong).
 *
 * The validator compiler mirrors apps/api/src/server.ts's `registerRequestValidation`
 * exactly (strict, no `removeAdditional`, no type coercion for bodies) —
 * without it Fastify's OWN default Ajv config silently strips unknown
 * properties instead of rejecting them, which would make this package's
 * `additionalProperties: false` contract test pass for the wrong reason.
 *
 * `identityPlugin` reads its config from `process.env` at registration time
 * (E02-S032 development boundary — one register() line in server.ts, no
 * options threaded through), so `env` here is applied to `process.env` just
 * long enough for that one registration call and restored immediately after.
 *
 * `.ready()` is called here (not left to `.inject()`'s implicit boot) so that
 * `seedDemoUsers` has definitely run by the time callers touch `db` directly
 * without going through an HTTP request first. A test that needs to register
 * ITS OWN extra route on `app` (Fastify refuses new routes after boot) should
 * build a bare Fastify instance + identityPlugin itself instead of using this
 * helper — see plugin.test.ts's AC9/AC8 suites.
 */
import type { Database } from "better-sqlite3";
import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { identityPlugin } from "../plugin.js";
import { createTestDatabase } from "./db.js";

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: Database;
}

function registerStrictBodyValidation(app: FastifyInstance): void {
  const strict = new Ajv2020.default({ strict: false, allErrors: true, removeAdditional: false, coerceTypes: false, useDefaults: true });
  addFormats.default(strict);
  app.setValidatorCompiler(({ schema }) => strict.compile(schema as object));
}

export interface BuildTestAppOptions {
  /** Captures pino output (e.g. the E02-S034 LOGIN_RATE_LIMITED line) — only `write` is required. */
  readonly loggerStream?: { write(chunk: string): void };
}

export async function buildTestApp(
  env: Record<string, string> = {},
  options: BuildTestAppOptions = {},
): Promise<TestApp> {
  const db = createTestDatabase();
  const app = Fastify(options.loggerStream ? { logger: { level: "warn", stream: options.loggerStream } } : {});
  registerStrictBodyValidation(app);
  await app.register(cookie);
  app.decorate("db", db);
  app.addHook("onClose", async () => {
    db.close();
  });

  const originalEnv = { ...process.env };
  Object.assign(process.env, env);
  try {
    await app.register(identityPlugin);
  } finally {
    process.env = originalEnv;
  }

  await app.ready();
  return { app, db };
}
