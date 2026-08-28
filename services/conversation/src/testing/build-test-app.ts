/**
 * HTTP-level test harness for THIS package's route tests.
 *
 * Builds a minimal Fastify instance decorating exactly the surface
 * `apps/api/README.md` promises a domain plugin (`db`, `requireSession`,
 * `contracts`), then mounts the real `conversationPlugin` — so a route test
 * exercises the actual route handlers, the actual repository, and the
 * actual `db/migrations/202608280001_conversation_domain.sql` schema
 * (loaded from disk, not hand-duplicated), which is as close to a true L2/L3
 * seam test as this package can get without depending on `apps/api` (see
 * `plugin-types.ts` and `contract-check.ts` for why that dependency
 * direction is avoided). The full assembled stack — real `apps/api`
 * error envelope, real cookie session — is exercised later by
 * `E03-S038`'s E2E infrastructure and by `apps/api`'s own tests once this
 * plugin is registered there (already done, E04-S040).
 *
 * The request-validation and error-handling behaviour below is a deliberate,
 * narrow re-implementation of `apps/api/src/server.ts`'s
 * `registerRequestValidation` and `apps/api/src/errors.ts`'s
 * `registerErrorHandling` — same reasoning as `contract-check.ts`.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest } from "fastify";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import Database from "better-sqlite3";
import { conversationPlugin } from "../plugin.js";
import { loadConversationsContract } from "./contract-check.js";
import { hostChangeEventBus } from "../plugin-types.js";
import type { ChangeEventBus } from "../events/change-event-bus.js";

const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;

export const TEST_USER_HEADER = "x-test-user";

const STATUS_TO_CODE: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
};

function safeMessageFor(code: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "請求內容不符合契約定義。";
    case "UNAUTHENTICATED":
      return "請先登入。";
    case "PERMISSION_DENIED":
      return "沒有執行這個操作的權限。";
    case "NOT_FOUND":
      return "找不到這筆資料。";
    default:
      return "系統發生未預期的錯誤,請稍後再試。";
  }
}

function resolveRepoRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "db", "migrations"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 db/migrations 目錄(從 ${from} 逐層往上找)。`);
}

function openMigratedDatabase(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  const migrationFile = path.join(
    resolveRepoRoot(),
    "db",
    "migrations",
    "202608280001_conversation_domain.sql",
  );
  db.exec(readFileSync(migrationFile, "utf8"));
  return db;
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: Database.Database;
  /** E04-S044: lets a test pre-fill/inspect connection state directly, e.g. the 429 connection-limit test. */
  readonly changeEventBus: ChangeEventBus;
}

export interface BuildTestAppOptions {
  /** E04-S044: shrinks the SSE heartbeat interval so stream tests don't wait on the real 15s default. */
  readonly heartbeatIntervalMs?: number;
}

export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<TestApp> {
  const db = openMigratedDatabase();
  const registry = await loadConversationsContract();

  const app = Fastify({ logger: false });

  // Mirrors apps/api/src/server.ts's registerRequestValidation: bodies are
  // strict (no coercion, no silent additionalProperties stripping);
  // querystring/params/headers coerce, since those are always strings on
  // the wire.
  const strict = new Ajv2020({
    strict: false,
    allErrors: true,
    removeAdditional: false,
    coerceTypes: false,
    useDefaults: true,
  });
  const coercing = new Ajv2020({
    strict: false,
    allErrors: true,
    removeAdditional: false,
    coerceTypes: "array",
    useDefaults: true,
  });
  addFormats(strict);
  addFormats(coercing);
  app.setValidatorCompiler(({ schema, httpPart }) => {
    const ajv = httpPart === "body" || httpPart === undefined ? strict : coercing;
    return ajv.compile(schema as object);
  });

  app.decorate("db", db);

  app.decorate("requireSession", async function requireSession(request: FastifyRequest) {
    const header = request.headers[TEST_USER_HEADER];
    const userId = Array.isArray(header) ? header[0] : header;
    if (typeof userId !== "string" || userId.trim() === "") {
      throw Object.assign(new Error(safeMessageFor("UNAUTHENTICATED")), { statusCode: 401 });
    }
    Object.assign(request, {
      auth: { userId, ownerKey: userId, roles: [], sessionId: `test-session:${userId}` },
    });
  });

  app.decorate("contracts", {
    getSchema(specName: string, schemaName: string): Record<string, unknown> {
      if (specName !== "conversations") {
        throw new Error(`測試 harness 只認得 "conversations" 契約,收到 "${specName}"。`);
      }
      const components = registry.document.components as { schemas?: Record<string, unknown> } | undefined;
      const schema = components?.schemas?.[schemaName];
      if (!schema) throw new Error(`契約沒有名為 "${schemaName}" 的 schema。`);
      return schema as Record<string, unknown>;
    },
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      reply.status(400).send({
        code: "VALIDATION_ERROR",
        message: safeMessageFor("VALIDATION_ERROR"),
        details: { issues: error.validation },
      });
      return;
    }
    const status = typeof error.statusCode === "number" ? error.statusCode : 500;
    const mapped = STATUS_TO_CODE[status];
    if (mapped && status < 500) {
      reply.status(status).send({ code: mapped, message: error.message || safeMessageFor(mapped) });
      return;
    }
    reply.status(500).send({ code: "INTERNAL_ERROR", message: safeMessageFor("INTERNAL_ERROR") });
  });

  await app.register(conversationPlugin, { heartbeatIntervalMs: options.heartbeatIntervalMs });
  await app.ready();

  return { app, db, changeEventBus: hostChangeEventBus(app) };
}
