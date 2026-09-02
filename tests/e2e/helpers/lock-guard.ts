import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_OWNER_FILE_PATH = "/data/python/AI_KM-worktrees/.e2e.owner";
const DEFAULT_LOCK_FILE_PATH = "/data/python/AI_KM-worktrees/.e2e.lock";

export type IsLockFileContended = (lockFilePath: string) => boolean;

/**
 * E04-S068. `flock -n <path> -c true` has exactly three observed exit
 * states (measured, not inferred from the man page):
 *
 *   - exit 0:  lock file absent OR free -- flock itself CREATES the file
 *              if it doesn't exist. Not a failure, not contention.
 *   - exit 1:  genuinely held by another process. This is the ONLY case
 *              this guard exists to catch.
 *   - anything else (observed: exit 66 when the lock path's parent
 *              directory does not exist -- "cannot open lock file ...:
 *              No such file or directory" -- or `flock` itself missing/
 *              unspawnable): the check could not run at all. This is NOT
 *              evidence that anyone holds the lock; it means the lock
 *              PATH is unusable in this environment (e.g. a hardcoded
 *              dev-machine path evaluated on a CI runner).
 *
 * Only exit 1 means "held". Everything else that isn't exit 0 is a
 * distinct failure mode -- thrown as `LockPathUnusableError` below --
 * so the caller can say what's actually wrong instead of misreporting
 * "someone else holds it" for a lock file that was never reachable.
 */
export class LockPathUnusableError extends Error {
  constructor(lockFilePath: string, cause: unknown) {
    super(
      `[E04-S057/E04-S068] Cannot determine whether the shared E2E lock (${lockFilePath}) is held: ` +
        `the lock path itself is unusable (${describeFlockFailure(cause)}). This is NOT the same as ` +
        `someone else holding the lock -- flock could not even attempt the check, most likely because ` +
        `the lock file's parent directory does not exist on this machine, or \`flock\` is not installed. ` +
        `Refusing to start Playwright anyway: per this guard's fail-closed premise, uncertainty must ` +
        `never silently resolve to "proceed". Set AI_KM_E2E_LOCK_FILE to a path whose parent directory ` +
        `exists here (in CI, e.g. a runner-local temp path) and re-run.`,
      { cause },
    );
    this.name = "LockPathUnusableError";
  }
}

function describeFlockFailure(cause: unknown): string {
  const err = cause as { status?: number | null; code?: string; stderr?: Buffer | string } | undefined;
  const stderr = err?.stderr ? err.stderr.toString().trim() : undefined;
  if (err?.code === "ENOENT" && err.status == null) {
    return "the `flock` command could not be spawned (not installed?)" + (stderr ? `: ${stderr}` : "");
  }
  if (typeof err?.status === "number") {
    return `flock exited ${err.status}` + (stderr ? `: ${stderr}` : " (parent directory of the lock path likely does not exist)");
  }
  return stderr ?? "unknown flock failure";
}

/**
 * Non-blocking `flock -n <path> -c true`: acquires the lock, runs a no-op,
 * releases it, exits 0 — succeeds only when NOBODY else currently holds
 * it. Exit 1 means genuinely held (see the table above) and is the only
 * case that means "contended" here. Any other non-zero outcome means the
 * check itself couldn't run, which throws `LockPathUnusableError` instead
 * of collapsing to "contended" -- that would misreport an unusable path
 * as someone else's hold, which is exactly the bug this story fixes.
 */
function isLockFileContended(lockFilePath: string): boolean {
  try {
    execFileSync("flock", ["-n", lockFilePath, "-c", "true"], { stdio: ["ignore", "ignore", "pipe"] });
    return false;
  } catch (err) {
    const status = (err as { status?: number | null }).status;
    if (status === 1) {
      return true;
    }
    throw new LockPathUnusableError(lockFilePath, err);
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
 *
 * **Deliberately NOT exempted: `playwright test --list`.** It's read-only
 * and binds no port, so blocking it while someone else holds the lock costs
 * a diagnostic and buys nothing — a real argument existed for special-casing
 * it. Decided against, on purpose, for three reasons: (1) at
 * `playwright.config.ts` module-eval time there is no reliable, official
 * signal for "this is list mode" short of parsing `process.argv`, which is
 * fragile against future Playwright flag changes and would silently stop
 * working; (2) a list of "harmless flag" exemptions is exactly the kind of
 * special-case pile this story exists to prevent — see the `.e2e.owner`
 * history above; (3) the workaround cost of not exempting it is small
 * (check `.e2e.owner`, ask the holder, or wait). If this is ever
 * revisited, the right discriminator is "does this invocation start a
 * webServer / bind a port," not a flag whitelist — and only once that can
 * be determined reliably, not via argv-sniffing. See
 * docs/stories/E04-S057.md, "刻意決定不做的事" for the full writeup.
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
