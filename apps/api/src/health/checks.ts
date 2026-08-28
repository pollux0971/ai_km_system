/**
 * Subsystem health checks (E04-S047).
 *
 * Four independent, side-effect-free checks (`api`/`database`/`migrations`/
 * `asr`) plus a small result cache so `GET /v1/health` — hit by every
 * lane's own E2E setup — cannot amplify traffic into the database or a
 * real `whisper-server` process on every request.
 */
import { readdirSync } from "node:fs";
import type { Database } from "better-sqlite3";
import type { ApiConfig } from "../config.js";

export type SubsystemName = "api" | "database" | "migrations" | "asr";
export type SubsystemStatus = "ok" | "degraded" | "down" | "unknown";

export interface Subsystem {
  readonly name: SubsystemName;
  readonly status: SubsystemStatus;
  readonly detail?: string;
}

export interface SystemHealth {
  readonly checkedAt: string;
  readonly subsystems: readonly Subsystem[];
}

/** Always ok: reaching this code at all means the process is up and answering. */
export function checkApi(): Subsystem {
  return { name: "api", status: "ok" };
}

/**
 * `SELECT 1` proves the connection answers queries; the journal mode proves
 * it is the mode `openDatabase` (E04-S040) actually asks for. `:memory:`
 * databases (every test in this repo that doesn't use a real file) report
 * `"memory"` instead of `"wal"` — SQLite cannot WAL an in-memory database —
 * so both are treated as healthy; anything else means the connection was
 * opened outside `openDatabase`'s normal path.
 */
export function checkDatabase(db: Database): Subsystem {
  try {
    db.prepare("SELECT 1").get();
    const journalMode = db.pragma("journal_mode", { simple: true }) as string;
    if (journalMode === "wal" || journalMode === "memory") {
      return { name: "database", status: "ok" };
    }
    return { name: "database", status: "degraded", detail: `journal_mode=${journalMode}` };
  } catch (error) {
    return { name: "database", status: "down", detail: (error as Error).message };
  }
}

/**
 * Disk `.sql` files (`db/migrations/`) vs the `schema_migrations` table
 * (E04-S040's migration runner). A file on disk with no matching row means
 * this process is running against a database nobody has migrated yet — not
 * itself a crash, but a real operational gap worth surfacing, hence
 * `degraded` (not `down`) with the pending filenames named so an operator
 * does not have to go spelunking.
 */
export function checkMigrations(db: Database, migrationsDir: string): Subsystem {
  try {
    const diskFiles = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const appliedRows = db.prepare("SELECT name FROM schema_migrations").all() as ReadonlyArray<{
      name: string;
    }>;
    const applied = new Set(appliedRows.map((row) => row.name));
    const pending = diskFiles.filter((name) => !applied.has(name));
    if (pending.length > 0) {
      return { name: "migrations", status: "degraded", detail: `pending: ${pending.join(", ")}` };
    }
    return { name: "migrations", status: "ok" };
  } catch (error) {
    return { name: "migrations", status: "down", detail: (error as Error).message };
  }
}

export interface CheckAsrOptions {
  /** Overridden by tests; defaults to the real global `fetch`. */
  readonly fetchImpl?: typeof fetch;
  /** Overridden by tests; defaults to the spec's 2000ms. */
  readonly timeoutMs?: number;
}

/**
 * `fake` never leaves the process, so it is always `ok`. `whisper-server`
 * gets one bounded `GET /health` — a fetch failure (refused, DNS, or the
 * `AbortSignal.timeout` firing) is `down`; a non-2xx response is `down` too
 * (the server answered but reports itself unhealthy); a 2xx is `ok`.
 * `AsrProvider` is a closed 2-value union (`config.ts`), so the `unknown`
 * branch below is unreachable today — kept anyway so a future third
 * provider value fails safe (an unrecognised provider is honestly
 * "we don't know", not a guessed ok/down) rather than needing this file
 * edited in lock-step with `config.ts`.
 */
export async function checkAsr(
  config: Pick<ApiConfig, "asrProvider" | "asrServerUrl">,
  options: CheckAsrOptions = {},
): Promise<Subsystem> {
  if (config.asrProvider === "fake") {
    return { name: "asr", status: "ok" };
  }
  if (config.asrProvider !== "whisper-server") {
    return { name: "asr", status: "unknown" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 2000;
  try {
    const res = await fetchImpl(`${config.asrServerUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { name: "asr", status: "ok" };
    return { name: "asr", status: "down", detail: `HTTP ${res.status}` };
  } catch (error) {
    return { name: "asr", status: "down", detail: (error as Error).message };
  }
}

export interface HealthCheckerDeps {
  readonly db: Database;
  readonly migrationsDir: string;
  readonly config: Pick<ApiConfig, "asrProvider" | "asrServerUrl">;
  /** Overridden by tests to control cache expiry deterministically. */
  readonly now?: () => number;
  readonly fetchImpl?: typeof fetch;
  /** Overridden by tests; defaults to the spec's 5000ms. */
  readonly cacheTtlMs?: number;
}

export interface HealthChecker {
  getHealth(): Promise<SystemHealth>;
}

/**
 * Runs all four checks and caches the combined result for `cacheTtlMs`
 * (spec: 5s) so `GET /v1/health` — which every lane's E2E setup polls —
 * cannot turn into a `whisper-server` request storm. One checker per
 * `buildServer()` call (see `server.ts`), not a module-level singleton: a
 * module-level cache would leak state between the many server instances
 * each test file builds.
 */
export function createHealthChecker(deps: HealthCheckerDeps): HealthChecker {
  const now = deps.now ?? Date.now;
  const cacheTtlMs = deps.cacheTtlMs ?? 5000;
  let cached: { result: SystemHealth; expiresAt: number } | undefined;

  async function compute(): Promise<SystemHealth> {
    const [api, database, migrations, asr] = await Promise.all([
      Promise.resolve(checkApi()),
      Promise.resolve(checkDatabase(deps.db)),
      Promise.resolve(checkMigrations(deps.db, deps.migrationsDir)),
      checkAsr(deps.config, { fetchImpl: deps.fetchImpl }),
    ]);
    return { checkedAt: new Date(now()).toISOString(), subsystems: [api, database, migrations, asr] };
  }

  return {
    async getHealth(): Promise<SystemHealth> {
      const nowMs = now();
      if (cached && cached.expiresAt > nowMs) {
        return cached.result;
      }
      const result = await compute();
      cached = { result, expiresAt: nowMs + cacheTtlMs };
      return result;
    },
  };
}

/** `down` degrades the aggregate; `unknown` does not (spec AC1: "任一 subsystem down → degraded"). */
export function overallStatus(health: SystemHealth): "ok" | "degraded" {
  return health.subsystems.some((subsystem) => subsystem.status === "down") ? "degraded" : "ok";
}
