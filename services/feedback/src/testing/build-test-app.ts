/**
 * HTTP-level test harness for THIS package's route tests — same rationale
 * and shape as `services/conversation/src/testing/build-test-app.ts` (see
 * its header). The db here loads BOTH the conversation-domain migration
 * (feedback queue routes read the real `messages` table) and this story's
 * own analytics migration, from disk, not hand-duplicated schema.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest } from "fastify";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import Database from "better-sqlite3";
import { feedbackPlugin } from "../plugin.js";
import { loadAnalyticsContract } from "./contract-check.js";

const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;

export const TEST_USER_HEADER = "x-test-user";
export const TEST_ROLES_HEADER = "x-test-roles";

const STATUS_TO_CODE: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  409: "CONFLICT",
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
  const migrationsDir = path.join(resolveRepoRoot(), "db", "migrations");
  db.exec(readFileSync(path.join(migrationsDir, "202608280001_conversation_domain.sql"), "utf8"));
  db.exec(readFileSync(path.join(migrationsDir, "202608280003_analytics.sql"), "utf8"));
  return db;
}

export interface TestApp {
  readonly app: FastifyInstance;
  readonly db: Database.Database;
}

export async function buildTestApp(): Promise<TestApp> {
  const db = openMigratedDatabase();
  const registry = await loadAnalyticsContract();

  const app = Fastify({ logger: false });

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
    const rolesHeader = request.headers[TEST_ROLES_HEADER];
    const rolesRaw = Array.isArray(rolesHeader) ? rolesHeader[0] : rolesHeader;
    const roles = typeof rolesRaw === "string" && rolesRaw.trim() !== "" ? rolesRaw.split(",") : [];
    Object.assign(request, {
      auth: { userId, ownerKey: userId, roles, sessionId: `test-session:${userId}` },
    });
  });

  app.decorate("contracts", {
    getSchema(specName: string, schemaName: string): Record<string, unknown> {
      if (specName !== "analytics") {
        throw new Error(`測試 harness 只認得 "analytics" 契約,收到 "${specName}"。`);
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
      reply.status(status).send({ code: mapped, message: safeMessageFor(mapped) });
      return;
    }
    reply.status(500).send({ code: "INTERNAL_ERROR", message: safeMessageFor("INTERNAL_ERROR") });
  });

  await app.register(feedbackPlugin);
  await app.ready();

  return { app, db };
}
