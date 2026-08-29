import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNotBlockingLockHolder } from "./lock-guard";

/**
 * E04-S057. Every test points `ownerFilePath`/`lockFilePath` at their own
 * throwaway temp files — never the real shared `.e2e.owner`/`.e2e.lock` —
 * so running this suite can never itself interfere with another lane's
 * actual lock state. `isLockFileContendedOverride` stands in for the real
 * `flock` probe so these tests are deterministic and don't depend on
 * actually spawning `flock` (that behavior has its own coverage in the
 * end-to-end check against the real `e2e-locked.sh` wrapper — see
 * docs/stories/E04-S057.md's EVIDENCE).
 */
describe("assertNotBlockingLockHolder", () => {
  let dir: string;
  let ownerFilePath: string;
  let lockFilePath: string;
  let tokenFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "e2e-lock-guard-test-"));
    ownerFilePath = join(dir, "owner-file-for-test");
    lockFilePath = join(dir, "lock-file-for-test");
    tokenFilePath = `${ownerFilePath}.token`;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("AC4: proceeds when the lock itself reports not contended, regardless of the owner file", () => {
    const isLockFileContendedOverride = vi.fn().mockReturnValue(false);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, isLockFileContendedOverride })).not.toThrow();
    expect(isLockFileContendedOverride).toHaveBeenCalledWith(lockFilePath);
  });

  it("2026-08-29 ai-km-83 incident: proceeds when nobody holds the lock even though .e2e.owner does not exist (the acquire-then-write race) -- absence of the owner file is NOT evidence either way", () => {
    // No owner file written at all -- this reproduces exactly the state
    // ai-km-83 observed and mistook for "free" using the OLD file-based
    // guard. The lock check itself is the only thing that matters.
    const isLockFileContendedOverride = vi.fn().mockReturnValue(false);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, isLockFileContendedOverride })).not.toThrow();
  });

  it("2026-08-29 ai-km-83 incident, the actual failure mode: BLOCKS when the lock is genuinely held even though .e2e.owner is absent", () => {
    // This is the exact scenario that would have slipped through the
    // OLD (owner-file-based) guard: no owner file, but flock says held.
    const isLockFileContendedOverride = vi.fn().mockReturnValue(true);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, isLockFileContendedOverride })).toThrow(/currently held/);
  });

  it("AC1/AC2: throws naming the holder (best-effort label from .e2e.owner) when the lock is contended and this process has no matching token", () => {
    writeFileSync(ownerFilePath, "w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12+08:00\n");
    const isLockFileContendedOverride = vi.fn().mockReturnValue(true);

    expect(() =>
      assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, lockToken: undefined, isLockFileContendedOverride }),
    ).toThrow(/w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12\+08:00/);
  });

  it("throws with a generic label (not a crash) when the lock is contended and .e2e.owner is also absent", () => {
    const isLockFileContendedOverride = vi.fn().mockReturnValue(true);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, isLockFileContendedOverride })).toThrow(/someone else/);
  });

  it("AC1/AC2: throws when this process's lock token does not match the token the holder recorded", () => {
    writeFileSync(ownerFilePath, "w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12+08:00\n");
    writeFileSync(tokenFilePath, "holder-token-abc\n");
    const isLockFileContendedOverride = vi.fn().mockReturnValue(true);

    expect(() =>
      assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, lockToken: "some-other-token", isLockFileContendedOverride }),
    ).toThrow();
  });

  it("AC3: proceeds when this process's lock token matches the token the lock holder itself wrote, and never even probes contention", () => {
    writeFileSync(ownerFilePath, "w4-E03S039 pid=12345 2026-08-29T08:00:00+08:00\n");
    writeFileSync(tokenFilePath, "same-token-xyz\n");
    const isLockFileContendedOverride = vi.fn();

    expect(() =>
      assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, lockToken: "same-token-xyz", isLockFileContendedOverride }),
    ).not.toThrow();
    // AC3's failure mode: a fresh flock probe from inside the holder's
    // own process tree would itself misreport "contended" (flock
    // exclusivity is per open-file-description, not per-process) — the
    // token match must short-circuit BEFORE any such probe ever runs.
    expect(isLockFileContendedOverride).not.toHaveBeenCalled();
  });

  it("a re-worded/re-timestamped owner line for the SAME holder still proceeds via the token, without comparing the line text at all", () => {
    writeFileSync(ownerFilePath, "w1-E01S022-rerun4 pid=999999 2026-08-29T09:00:00+08:00\n");
    writeFileSync(tokenFilePath, "stable-token-1\n");
    const isLockFileContendedOverride = vi.fn();

    expect(() =>
      assertNotBlockingLockHolder({ ownerFilePath, lockFilePath, lockToken: "stable-token-1", isLockFileContendedOverride }),
    ).not.toThrow();
  });

  it("reads ownerFilePath/lockFilePath/lockToken from their env vars when no explicit options are given", () => {
    const previousOwnerFile = process.env.AI_KM_E2E_OWNER_FILE;
    const previousLockFile = process.env.AI_KM_E2E_LOCK_FILE;
    const previousToken = process.env.AI_KM_E2E_LOCK_TOKEN;
    try {
      writeFileSync(ownerFilePath, "someone-else pid=1 2026-08-29T00:00:00+08:00\n");
      process.env.AI_KM_E2E_OWNER_FILE = ownerFilePath;
      process.env.AI_KM_E2E_LOCK_FILE = lockFilePath;
      delete process.env.AI_KM_E2E_LOCK_TOKEN;

      expect(() => assertNotBlockingLockHolder({ isLockFileContendedOverride: () => true })).toThrow(/someone-else/);
    } finally {
      if (previousOwnerFile === undefined) delete process.env.AI_KM_E2E_OWNER_FILE;
      else process.env.AI_KM_E2E_OWNER_FILE = previousOwnerFile;
      if (previousLockFile === undefined) delete process.env.AI_KM_E2E_LOCK_FILE;
      else process.env.AI_KM_E2E_LOCK_FILE = previousLockFile;
      if (previousToken === undefined) delete process.env.AI_KM_E2E_LOCK_TOKEN;
      else process.env.AI_KM_E2E_LOCK_TOKEN = previousToken;
    }
  });
});
