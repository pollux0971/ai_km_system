import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * E04-S056 AC5.1. `reuseExistingServer: true` (local dev, `web`/`admin`
 * webServer entries) means Playwright's own `webServer.env` is only ever
 * applied to a server it starts itself — adopting an already-listening
 * process silently keeps THAT process's env instead, discarding
 * `API_INTERNAL_URL` / `NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE` /
 * `NEXT_PUBLIC_FEATURE_MOCK_TRIGGERS` without a word (this story's EVIDENCE
 * has the exact failure shape this produces: pagination silently reverts to
 * production's page size, `waitForURL` times out, looks exactly like a slow
 * machine — not like a config problem).
 *
 * `write-env-sentinel.mjs` runs as a shell step immediately before each
 * webServer's real dev command (`wrapCommandWithSentinel` below, wired in
 * `playwright.config.ts`), recording whatever env that specific process
 * launch actually got. A currently-listening process's sentinel is
 * therefore whatever launch actually started it — possibly a much earlier
 * run with different values — so comparing it against what THIS run
 * currently expects, before deciding to reuse, is exactly the check that
 * was missing.
 */

export function sentinelPath(port: number): string {
  // Must stay identical to write-env-sentinel.mjs's own path formula.
  return path.join(tmpdir(), `ai-km-e2e-webserver-env-${port}.json`);
}

export type SentinelValues = Record<string, string | null>;

export function readEnvSentinel(port: number): SentinelValues | undefined {
  const file = sentinelPath(port);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as SentinelValues;
}

/**
 * Throws with an actionable diff instead of letting a reused server with
 * stale/wrong env silently pass — the whole point of AC5.1. No CI exemption
 * needed: `reuseExistingServer` is false there, so a fresh sentinel is
 * always written by this same run, matching trivially.
 */
export function assertReusedServerEnvMatches(port: number, expected: SentinelValues): void {
  const actual = readEnvSentinel(port);
  if (actual === undefined) {
    throw new Error(
      `[E04-S056] port ${port} is already listening but has no env sentinel — it was not started by ` +
        `this playwright.config.ts (or predates this check), so its actual env cannot be verified and ` +
        `it must not be silently reused. Kill whatever is listening on port ${port} and rerun.`,
    );
  }
  const mismatches = Object.entries(expected).filter(([key, value]) => actual[key] !== value);
  if (mismatches.length > 0) {
    const detail = mismatches
      .map(([key, value]) => `  ${key}: expected "${value}", reused server has "${actual[key]}"`)
      .join("\n");
    throw new Error(
      `[E04-S056] port ${port}'s already-listening server was started with different env than this run ` +
        `needs, and reuse would silently keep the OLD values:\n${detail}\n\n` +
        `Kill whatever is listening on port ${port} and rerun so Playwright starts it fresh.`,
    );
  }
}

/**
 * Prepends a `write-env-sentinel.mjs` invocation to `command` so every real
 * start of this webServer (never a reuse — reuse skips `command` entirely,
 * which is precisely why a *previous* start's sentinel can go stale) records
 * the env values that launch actually used.
 */
export function wrapCommandWithSentinel(port: number, varNames: readonly string[], command: string): string {
  // `__dirname`, not `import.meta.url` — this repo's `tests/e2e/package.json`
  // has no `"type": "module"`, so Playwright's config loader requires this
  // file as CommonJS (confirmed the hard way: `import.meta` throws
  // `SyntaxError: Cannot use 'import.meta' outside a module` the moment
  // Playwright loads the config, even for a no-op `--list`). `port-check.ts`
  // and `fake-microphone.ts` avoid this by never needing directory
  // resolution at all; this is the same fix these two files use implicitly.
  const script = path.join(__dirname, "write-env-sentinel.mjs");
  return `node ${JSON.stringify(script)} ${port} ${varNames.join(" ")} && ${command}`;
}
