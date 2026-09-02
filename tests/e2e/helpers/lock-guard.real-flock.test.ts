import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNotBlockingLockHolder, LockPathUnusableError } from "./lock-guard";

/**
 * E04-S068. `lock-guard.test.ts` injects `isLockFileContendedOverride` in
 * every single case -- the production code path that actually shells out
 * to `flock` (the one that broke CI, see ROADMAP_TEMP.md 5-pi) is walked
 * by NO test at all. This file closes exactly that gap: every test below
 * calls `assertNotBlockingLockHolder` with NO override, so the real
 * `isLockFileContended` -> real `execFileSync("flock", ...)` path runs.
 *
 * Three cases, mapping to the three real `flock -n <path> -c true` exit
 * states measured for this story (not inferred from the man page):
 *   1. parent dir exists, lock file absent/free -> exit 0 -> not contended
 *   2. genuinely held by another process       -> exit 1 -> contended
 *   3. parent directory does not exist         -> exit 66 -> LockPathUnusableError
 */
describe("assertNotBlockingLockHolder -- real flock, no override injected", () => {
  let dir: string;
  let ownerFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "e2e-lock-guard-real-flock-test-"));
    ownerFilePath = join(dir, "owner-file-for-test");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("case 1: a tmp path whose parent exists and is unheld is reported NOT contended", () => {
    const lockFilePath = join(dir, "real-flock-unheld.lock");

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath })).not.toThrow();
  });

  it("case 2: a lock genuinely held by a spawned child process (real flock) is reported contended", async () => {
    const lockFilePath = join(dir, "real-flock-held.lock");
    const holder: ChildProcess = spawn("flock", [lockFilePath, "-c", "sleep 5"], { stdio: "ignore" });

    try {
      await waitUntilRealFlockReportsHeld(lockFilePath);

      expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath })).toThrow(/currently held/);
    } finally {
      holder.kill("SIGKILL");
    }
  });

  it("case 3: a path whose parent directory does not exist throws LockPathUnusableError, NOT 'held by someone else'", () => {
    const lockFilePath = join(dir, "no-such-subdir", "real-flock-parent-missing.lock");

    let caught: unknown;
    try {
      assertNotBlockingLockHolder({ ownerFilePath, lockFilePath });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(LockPathUnusableError);
    const message = (caught as Error).message;
    // The whole point of E04-S068: this must NOT be misreported as
    // "someone else holds it" (that was the bug that broke CI).
    expect(message).not.toMatch(/currently held/);
    expect(message).toMatch(/lock path itself is unusable/);
  });
});

/**
 * Polls the REAL `flock -n <path> -c true` (not the guard, not an
 * override) until it reports exit 1 (held) or a timeout elapses. Needed
 * because the spawned holder process acquires the flock asynchronously;
 * without this the test would race the holder's own startup.
 */
async function waitUntilRealFlockReportsHeld(lockFilePath: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      execFileSync("flock", ["-n", lockFilePath, "-c", "true"], { stdio: "ignore" });
      // exit 0 => still free, holder hasn't acquired yet.
    } catch (err) {
      if ((err as { status?: number | null }).status === 1) {
        return; // genuinely held now.
      }
      // Any other exit (e.g. transient ENOENT before the holder creates
      // the file) -- keep polling until the timeout.
    }
    if (Date.now() > deadline) {
      throw new Error(`real flock never reported ${lockFilePath} as held within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
