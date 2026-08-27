/**
 * Startup configuration for apps/api (E04-S039, ADR 0003).
 *
 * Every value is read once, validated, and frozen. There is deliberately no
 * "read an env var later, deep inside a handler" path: a misconfigured server
 * must fail at startup, loudly, rather than behave differently on the one
 * request that happens to hit the misconfigured branch.
 */

export type NodeEnv = "development" | "test" | "production";
export type AsrProvider = "whisper-server" | "fake";
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";

export interface ApiConfig {
  readonly nodeEnv: NodeEnv;
  readonly host: string;
  readonly port: number;
  readonly dbPath: string;
  readonly corsOrigins: readonly string[];
  readonly devTriggers: boolean;
  readonly testSandbox: boolean;
  readonly autoMigrate: boolean;
  readonly asrProvider: AsrProvider;
  readonly asrServerUrl: string;
  readonly logLevel: LogLevel;
}

/** Thrown when the environment cannot produce a valid config. Never caught internally. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

const NODE_ENVS: readonly NodeEnv[] = ["development", "test", "production"];
const ASR_PROVIDERS: readonly AsrProvider[] = ["whisper-server", "fake"];
const LOG_LEVELS: readonly LogLevel[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];

function fail(variable: string, reason: string): never {
  throw new ConfigError(`${variable} 設定無效:${reason}`);
}

function readEnum<T extends string>(
  env: NodeJS.ProcessEnv,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!(allowed as readonly string[]).includes(raw)) {
    fail(key, `必須是 ${allowed.join(" / ")} 其中之一,收到 "${raw}"。`);
  }
  return raw as T;
}

/**
 * Only the exact strings "true"/"false" are accepted. A typo like "yes" must
 * not quietly become `false` — a security flag that silently reads as "off"
 * is the same class of bug as one that silently reads as "on".
 */
function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fail(key, `必須是 "true" 或 "false",收到 "${raw}"。`);
}

function readPort(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) fail(key, `必須是整數,收到 "${raw}"。`);
  const port = Number(raw);
  if (port < 1 || port > 65535) fail(key, `必須介於 1–65535,收到 ${port}。`);
  return port;
}

function readUrl(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  try {
    // eslint-disable-next-line no-new
    new URL(raw);
  } catch {
    fail(key, `必須是合法的 URL,收到 "${raw}"。`);
  }
  return raw;
}

function readNonEmpty(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  return raw;
}

/**
 * Comma-separated allowlist. Empty (the default) means CORS stays off
 * entirely — see registerCors in server.ts.
 */
function readOriginList(env: NodeJS.ProcessEnv, key: string): string[] {
  const raw = env[key];
  if (raw === undefined || raw.trim() === "") return [];
  const origins = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  for (const origin of origins) {
    try {
      // eslint-disable-next-line no-new
      new URL(origin);
    } catch {
      fail(key, `"${origin}" 不是合法的 origin。`);
    }
  }
  return origins;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  // An unset NODE_ENV is development, never production: guessing "production"
  // would turn the fail-closed guards below into a startup failure for every
  // developer, and guessing it the other way round would disable them on a
  // real deployment. Development is the safe guess because the guards are
  // additive restrictions, not permissions.
  const nodeEnv = readEnum<NodeEnv>(env, "NODE_ENV", NODE_ENVS, "development");

  const devTriggers = readBoolean(env, "AI_KM_DEV_TRIGGERS", false);
  const testSandbox = readBoolean(env, "AI_KM_TEST_SANDBOX", false);

  // Fail closed (AC6 / ADR 0005 §4, §5). These two flags each open a path that
  // bypasses real authentication; neither may exist in production, and the
  // response is to refuse to start rather than to start with them disabled —
  // an operator who set them meant something, and silently ignoring that would
  // hide the misconfiguration.
  if (nodeEnv === "production" && testSandbox) {
    throw new ConfigError(
      "AI_KM_TEST_SANDBOX=true 不得在 NODE_ENV=production 下啟用(它會為每次登入建立隔離沙箱,繞過真實資料歸屬)。已拒絕啟動。",
    );
  }
  if (nodeEnv === "production" && devTriggers) {
    throw new ConfigError(
      "AI_KM_DEV_TRIGGERS=true 不得在 NODE_ENV=production 下啟用(它會開啟只供開發/測試的觸發路徑)。已拒絕啟動。",
    );
  }

  return Object.freeze({
    nodeEnv,
    host: readNonEmpty(env, "AI_KM_API_HOST", "127.0.0.1"),
    port: readPort(env, "AI_KM_API_PORT", 4000),
    dbPath: readNonEmpty(env, "AI_KM_DB_PATH", "./data/ai-km.sqlite"),
    corsOrigins: Object.freeze(readOriginList(env, "AI_KM_CORS_ORIGINS")),
    devTriggers,
    testSandbox,
    // Defaults ON so a developer's first `pnpm dev` just works. A production
    // deploy should set it false and run `pnpm --filter @ai-km/api migrate`
    // as its own step, so a schema change is never a side effect of a restart
    // (E04-S040; see db/migrations/README.md).
    autoMigrate: readBoolean(env, "AI_KM_AUTO_MIGRATE", true),
    asrProvider: readEnum<AsrProvider>(env, "AI_KM_ASR_PROVIDER", ASR_PROVIDERS, "whisper-server"),
    asrServerUrl: readUrl(env, "AI_KM_ASR_SERVER_URL", "http://127.0.0.1:8178"),
    logLevel: readEnum<LogLevel>(env, "AI_KM_LOG_LEVEL", LOG_LEVELS, "info"),
  });
}
