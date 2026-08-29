import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_OWNER_FILE_PATH = "/data/python/AI_KM-worktrees/.e2e.owner";
const DEFAULT_LOCK_FILE_PATH = "/data/python/AI_KM-worktrees/.e2e.lock";

export type IsLockFileContended = (lockFilePath: string) => boolean;

/**
 * Non-blocking `flock -n <path> -c true`: acquires the lock, runs a no-op,
 * releases it, exits 0 — succeeds only when NOBODY else currently holds
 * it. `flock` itself exits non-zero when it cannot acquire immediately.
 * `execFileSync` throws on both a non-zero exit AND on `flock` itself
 * being unavailable/broken — both cases collapse to the same answer we
 * want here: "cannot prove this is free, so treat it as contended."
 * That fail-toward-blocking default matches this story's whole premise
 * (uncertainty must never silently resolve to "proceed").
 */
function isLockFileContended(lockFilePath: string): boolean {
  try {
    execFileSync("flock", ["-n", lockFilePath, "-c", "true"], { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
}

export interface LockGuardOptions {
  /** Defaults to AI_KM_E2E_OWNER_FILE, then the real shared `.e2e.owner` path. Used ONLY for the error message's human-readable label — never for the block/proceed decision. */
  ownerFilePath?: string;
  /** Defaults to AI_KM_E2E_LOCK_FILE, then the real shared `.e2e.lock` path. This IS the block/proceed authority. */
  lockFilePath?: string;
  /** Defaults to AI_KM_E2E_LOCK_TOKEN. */
  lockToken?: string;
  /** Test-only injection point — production always uses the real non-blocking `flock` check. */
  isLockFileContendedOverride?: IsLockFileContended;
}

/**
 * E04-S057. `.e2e.lock`'s flock guarantees mutual exclusion only between
 * wrapper scripts that go through it — it does nothing to stop a
 * completely unguarded `playwright test` invocation (a bare `pnpm test`
 * at repo root fans out into `@ai-km/e2e:test` via turbo, with zero lock
 * awareness) from running concurrently against whatever a legitimate lock
 * holder's `next dev`/`apps/api` servers already have listening —
 * `resolveReuseExistingServer()` is `true` on every local machine, so
 * Playwright silently ADOPTS those servers instead of failing to bind.
 * Two independent test suites then drive the same servers at once, and
 * neither one's results can be trusted. This is exactly what corrupted
 * W1's E01-S022 rerun on 2026-08-29 (docs/stories/E04-S057.md).
 *
 * Call this at `playwright.config.ts` module-eval time, the same
 * synchronous phase `ensureFakeMicrophoneWav()`/`assertPortsFreeForCI()`
 * already run in — every entry point (`playwright test`, `--list`,
 * `--last-failed`, a turbo-triggered run) evaluates that module first, so
 * a single check there covers all of them.
 *
 * **The authority for "is anyone holding the lock right now" is the
 * flock itself, never `.e2e.owner`.** An earlier version of this guard
 * read the owner file for that question and only fell back to `flock`
 * semantics implicitly — proven wrong live on 2026-08-29 (`ai-km-83`):
 * they found `.e2e.owner` absent and concluded the lock was free, but
 * `flock`/`fuser` showed it genuinely held (the wrapper hadn't written
 * the file yet — there's an acquire-then-write window, and any path that
 * skips writing it produces the identical state). `.e2e.owner` is
 * unreliable in BOTH directions: it can be present-but-stale (a crashed
 * run's leftover claim — a dead process cannot still hold a flock, since
 * the OS releases it when the fd closes on exit, so this case resolves
 * itself for free once contention is checked directly) and it can be
 * absent-but-held (the race above). Querying `flock` directly has no
 * such window and cannot be stale — it answers the real question, not a
 * courtesy label's best guess at it. `.e2e.owner` is used below ONLY to
 * put a human-readable name in the thrown error, never to decide whether
 * to throw.
 *
 * "Am I the lock holder" (AC3) is checked FIRST, before any contention
 * probe, and deliberately does NOT itself call `flock` — a fresh
 * `flock -n` attempt opens its own independent file description, and
 * Linux flock() exclusivity is per-open-file-description, not per-
 * process: even a child of the process that legitimately holds the lock
 * (via the wrapper's own long-lived fd) would see a brand-new probe as
 * "contended," because it isn't the SAME open file description. Checking
 * identity via a per-acquisition TOKEN first (written to
 * `<ownerFilePath>.token` by the wrapper, exported as
 * `AI_KM_E2E_LOCK_TOKEN` to everything it spawns) sidesteps that trap
 * entirely — the holder always exits early here, before ever reaching a
 * probe that would otherwise misreport its own hold as someone else's.
 */
export function assertNotBlockingLockHolder(options: LockGuardOptions = {}): void {
  const ownerFilePath = options.ownerFilePath ?? process.env.AI_KM_E2E_OWNER_FILE ?? DEFAULT_OWNER_FILE_PATH;
  const lockFilePath = options.lockFilePath ?? process.env.AI_KM_E2E_LOCK_FILE ?? DEFAULT_LOCK_FILE_PATH;
  const lockToken = options.lockToken ?? process.env.AI_KM_E2E_LOCK_TOKEN;
  const checkContended = options.isLockFileContendedOverride ?? isLockFileContended;

  if (lockToken) {
    let holderToken: string | undefined;
    try {
      holderToken = readFileSync(`${ownerFilePath}.token`, "utf8").trim();
    } catch {
      holderToken = undefined;
    }
    if (holderToken && lockToken === holderToken) {
      return; // AC3: this process IS the recorded lock holder.
    }
  }

  if (!checkContended(lockFilePath)) {
    return; // AC4: the real mutex confirms nobody holds it.
  }

  let label = "someone else (no readable label)";
  try {
    const content = readFileSync(ownerFilePath, "utf8").trim();
    if (content) label = content;
  } catch {
    // Absent/unreadable owner file — per this function's own doc comment,
    // that does NOT mean the lock is free; it only means we can't name
    // who holds it. Falls through to the generic label above.
  }

  throw new Error(
    `[E04-S057] Refusing to start Playwright: the shared E2E lock (${lockFilePath}) is ` +
      `currently held, most likely by ${label}, and this process is not them. Running ` +
      `unguarded here would let Playwright's reuseExistingServer silently attach to their dev ` +
      `servers and corrupt their measurement (this is exactly what happened to W1's E01-S022 ` +
      `rerun on 2026-08-29). Wait for the lock to free, or run this inside the same flock-` +
      `protected wrapper that set AI_KM_E2E_LOCK_TOKEN (see e2e-locked.sh).`,
  );
}
