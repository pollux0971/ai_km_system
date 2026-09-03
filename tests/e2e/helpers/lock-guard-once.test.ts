import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertNotBlockingLockHolderOnce } from "./lock-guard";

/**
 * E01-S036. `lock-guard.test.ts` and `lock-guard.real-flock.test.ts` cover
 * `assertNotBlockingLockHolder` itself (unchanged by this story — see that
 * function's own doc comment) via an injected override and via a real
 * spawned `flock` holder, respectively, but NEITHER ever sets
 * `TEST_WORKER_INDEX` — so no existing test walks the worker-vs-main
 * composition this story adds. This file covers ONLY that new surface:
 * `assertNotBlockingLockHolderOnce()`, the exact function
 * `playwright.config.ts` now calls instead of `assertNotBlockingLockHolder`
 * directly.
 *
 * Deliberately a vitest `helpers/**\/*.test.ts` file (picked up by
 * `test:unit`), not a Playwright spec — running this via `playwright test`
 * would itself start webServers and touch the shared `.e2e.lock`, which is
 * exactly what this check runs to avoid depending on.
 *
 * Both cases below use the SAME genuinely-held lock (a real spawned `flock`
 * child, exactly like `lock-guard.real-flock.test.ts`'s case 2) — the only
 * variable between them is `TEST_WORKER_INDEX`, mirroring
 * `port-check.test.ts`'s pattern of setting/restoring it directly on
 * `process.env` to simulate "I am a real Playwright worker" / "I am the
 * real main process" without needing an actual Playwright run.
 */
describe("assertNotBlockingLockHolderOnce -- the exact guard playwright.config.ts calls", () => {
  let dir: string;
  let ownerFilePath: string;
  let lockFilePath: string;
  let holder: ChildProcess;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "e2e-lock-guard-once-test-"));
    ownerFilePath = join(dir, "owner-file-for-test");
    lockFilePath = join(dir, "held.lock");
    holder = spawn("flock", [lockFilePath, "-c", "sleep 5"], { stdio: "ignore" });
    await waitUntilRealFlockReportsHeld(lockFilePath);
  });

  afterEach(() => {
    holder.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
    delete process.env.TEST_WORKER_INDEX;
  });

  it("must still true-fire: in the real MAIN process (TEST_WORKER_INDEX unset), a genuinely foreign flock holder still makes it refuse, naming the lock path", () => {
    delete process.env.TEST_WORKER_INDEX;

    let caught: unknown;
    try {
      assertNotBlockingLockHolderOnce({ ownerFilePath, lockFilePath });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("[E04-S057] Refusing to start Playwright");
    expect(message).toContain(lockFilePath);
    expect(message).toMatch(/currently held/);
  });

  it("must stop false-firing: in a simulated WORKER process (TEST_WORKER_INDEX set), the SAME genuinely-held lock does not throw -- this is the exact self-race that made run 33658608842 fail (a sibling worker misreading another worker's momentary flock acquisition as a foreign holder)", () => {
    process.env.TEST_WORKER_INDEX = "1";

    expect(() => assertNotBlockingLockHolderOnce({ ownerFilePath, lockFilePath })).not.toThrow();
  });
});

/**
 * Polls the REAL `flock -n <path> -c true` (not the guard, not an
 * override) until it reports exit 1 (held) or a timeout elapses. Needed
 * because the spawned holder process acquires the flock asynchronously;
 * without this the test would race the holder's own startup. Copied from
 * `lock-guard.real-flock.test.ts` rather than imported -- that file keeps
 * this as a private, unexported helper.
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
