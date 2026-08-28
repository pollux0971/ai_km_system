/**
 * Startup configuration for `@ai-km/service-identity` (E02-S032, ADR 0005).
 *
 * Self-contained on purpose: this package is registered into apps/api with a
 * single `await app.register(identityPlugin)` line (E02-S032 development
 * boundary), so it cannot receive options threaded through apps/api's own
 * `ApiConfig`. It reads its own environment variables and repeats the
 * production fail-closed guards apps/api's `loadConfig` already applies to
 * `AI_KM_DEV_TRIGGERS` / `AI_KM_TEST_SANDBOX` — defence in depth, the same
 * pattern `buildServer` uses for the test auth provider: a guard that only
 * lived in one caller would stop protecting anything the moment a second
 * caller forgot to repeat it.
 */

export type IdentityNodeEnv = "development" | "test" | "production";

export interface IdentityConfig {
  readonly nodeEnv: IdentityNodeEnv;
  readonly devTriggers: boolean;
  readonly testSandbox: boolean;
  readonly seedDemoUsers: boolean;
  /**
   * `AI_KM_SESSION_COOKIE_DOMAIN` (E02-S033, optional). Unset -> host-only
   * cookie, the right default when apps/web/apps/admin share a host. Not a
   * security bypass flag, so unlike the three booleans above it carries no
   * production restriction.
   */
  readonly sessionCookieDomain: string | undefined;
  /** `AI_KM_LOGIN_RATE_LIMIT` (E02-S034). See `parseLoginRateLimit`'s docstring for the format. */
  readonly loginRateLimit: LoginRateLimitConfig;
}

export interface LoginRateLimitConfig {
  readonly perUsernameMaxFailures: number;
  readonly perIpMaxFailures: number;
  readonly windowMinutes: number;
}

const DEFAULT_LOGIN_RATE_LIMIT: LoginRateLimitConfig = Object.freeze({
  perUsernameMaxFailures: 5,
  perIpMaxFailures: 20,
  windowMinutes: 15,
});

const LOGIN_RATE_LIMIT_KEYS = ["perUsernameMaxFailures", "perIpMaxFailures", "windowMinutes"] as const;
type LoginRateLimitKey = (typeof LOGIN_RATE_LIMIT_KEYS)[number];

/**
 * `AI_KM_LOGIN_RATE_LIMIT` (E02-S034, optional) — a brand-new env var this
 * story introduces, so its shape is this story's to define, not something
 * copied from an existing contract. Format: comma-separated `key:value`
 * pairs, any subset of the three keys below; unset -> the spec's own
 * defaults (5 per-username / 20 per-IP / 15-minute window).
 *
 * Example: `AI_KM_LOGIN_RATE_LIMIT=perUsernameMaxFailures:2,perIpMaxFailures:3`
 * — tests use exactly this to trigger a lockout after a handful of real
 * `POST /auth/login` calls instead of the production thresholds (AC7 asks
 * for the THRESHOLDS to be tunable for fast tests; the 15-minute WINDOW
 * itself is tested by seeding old `attempted_at` timestamps directly,
 * documented in EVIDENCE, not by shrinking the window).
 */
export function parseLoginRateLimit(raw: string | undefined): LoginRateLimitConfig {
  if (raw === undefined || raw === "") return DEFAULT_LOGIN_RATE_LIMIT;

  const result: Record<LoginRateLimitKey, number> = { ...DEFAULT_LOGIN_RATE_LIMIT };
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) {
      throw new IdentityConfigError(
        `AI_KM_LOGIN_RATE_LIMIT 設定無效:項目 "${trimmed}" 必須是 key:value 格式。`,
      );
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const valueRaw = trimmed.slice(separatorIndex + 1).trim();
    if (!(LOGIN_RATE_LIMIT_KEYS as readonly string[]).includes(key)) {
      throw new IdentityConfigError(
        `AI_KM_LOGIN_RATE_LIMIT 設定無效:未知欄位 "${key}"。合法欄位:${LOGIN_RATE_LIMIT_KEYS.join(", ")}。`,
      );
    }
    const value = Number(valueRaw);
    if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
      throw new IdentityConfigError(
        `AI_KM_LOGIN_RATE_LIMIT 設定無效:"${key}" 必須是正整數,收到 "${valueRaw}"。`,
      );
    }
    result[key as LoginRateLimitKey] = value;
  }
  return Object.freeze(result) as LoginRateLimitConfig;
}

export class IdentityConfigError extends Error {
  override readonly name = "IdentityConfigError";
}

/** Only the exact strings "true"/"false" are accepted — see apps/api/src/config.ts for the rationale. */
function readBoolean(env: NodeJS.ProcessEnv, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new IdentityConfigError(`${key} 設定無效:必須是 "true" 或 "false",收到 "${raw}"。`);
}

function readNodeEnv(env: NodeJS.ProcessEnv): IdentityNodeEnv {
  const raw = env.NODE_ENV;
  if (raw === "production" || raw === "test") return raw;
  // Unset or anything else is development, never production — guessing
  // "production" would turn the guards below into a startup failure for
  // every developer; guessing it the other way would disable them on a real
  // deployment.
  return "development";
}

export function loadIdentityConfig(env: NodeJS.ProcessEnv = process.env): IdentityConfig {
  const nodeEnv = readNodeEnv(env);
  const devTriggers = readBoolean(env, "AI_KM_DEV_TRIGGERS", false);
  const testSandbox = readBoolean(env, "AI_KM_TEST_SANDBOX", false);
  // Demo accounts ship with a published password (demo-pass-123). Seeding
  // them is the useful default in development/test and a credential leak in
  // production, so the default flips with nodeEnv rather than needing every
  // production deploy to remember to opt out.
  const seedDemoUsers = readBoolean(env, "AI_KM_SEED_DEMO_USERS", nodeEnv !== "production");
  const rawCookieDomain = env.AI_KM_SESSION_COOKIE_DOMAIN;
  const sessionCookieDomain = rawCookieDomain === undefined || rawCookieDomain === "" ? undefined : rawCookieDomain;
  const loginRateLimit = parseLoginRateLimit(env.AI_KM_LOGIN_RATE_LIMIT);

  if (nodeEnv === "production" && devTriggers) {
    throw new IdentityConfigError(
      "AI_KM_DEV_TRIGGERS=true 不得在 NODE_ENV=production 下啟用(它會開啟只供開發/測試的登入觸發路徑)。已拒絕啟動。",
    );
  }
  if (nodeEnv === "production" && testSandbox) {
    throw new IdentityConfigError(
      "AI_KM_TEST_SANDBOX=true 不得在 NODE_ENV=production 下啟用(它會為每次登入建立隔離沙箱,繞過真實資料歸屬)。已拒絕啟動。",
    );
  }
  if (nodeEnv === "production" && seedDemoUsers) {
    throw new IdentityConfigError(
      "AI_KM_SEED_DEMO_USERS=true 不得在 NODE_ENV=production 下啟用(示範帳號密碼是公開已知值)。已拒絕啟動。",
    );
  }

  return Object.freeze({ nodeEnv, devTriggers, testSandbox, seedDemoUsers, sessionCookieDomain, loginRateLimit });
}
