import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertNotBlockingLockHolder } from "./lock-guard";

/**
 * E04-S057. Every test points `ownerFilePath` at its own throwaway temp
 * file — never the real shared `/data/python/AI_KM-worktrees/.e2e.owner`
 * — so running this suite can never itself interfere with another lane's
 * actual lock state. `isProcessAliveOverride` is likewise injectable so
 * the stale-PID branch is deterministic without depending on real PIDs
 * on whatever machine runs this suite.
 */
describe("assertNotBlockingLockHolder", () => {
  let dir: string;
  let ownerFilePath: string;
  let tokenFilePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "e2e-lock-guard-test-"));
    ownerFilePath = join(dir, "owner-file-for-test");
    tokenFilePath = `${ownerFilePath}.token`;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("AC4: proceeds (does not throw) when the owner file does not exist — nobody holds the lock", () => {
    expect(() => assertNotBlockingLockHolder({ ownerFilePath })).not.toThrow();
  });

  it("treats a present-but-empty owner file the same as absent (AC4)", () => {
    writeFileSync(ownerFilePath, "");

    expect(() => assertNotBlockingLockHolder({ ownerFilePath })).not.toThrow();
  });

  it("AC1/AC2: throws, naming the current holder, when a live holder's owner file exists and this process has no matching lock token", () => {
    writeFileSync(ownerFilePath, "w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12+08:00\n");
    writeFileSync(tokenFilePath, "holder-token-abc\n");
    const isProcessAliveOverride = vi.fn().mockReturnValue(true);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockToken: undefined, isProcessAliveOverride })).toThrow(
      /w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12\+08:00/,
    );
    expect(isProcessAliveOverride).toHaveBeenCalledWith(811430);
  });

  it("AC1/AC2: throws when this process's lock token does not match the token the holder recorded", () => {
    writeFileSync(ownerFilePath, "w1-E01S022-rerun3 pid=811430 2026-08-29T07:39:12+08:00\n");
    writeFileSync(tokenFilePath, "holder-token-abc\n");
    const isProcessAliveOverride = vi.fn().mockReturnValue(true);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockToken: "some-other-token", isProcessAliveOverride })).toThrow();
  });

  it("AC3: proceeds when this process's lock token matches the token the lock holder itself wrote — the holder is never blocked by its own lock", () => {
    writeFileSync(ownerFilePath, "w4-E03S039 pid=12345 2026-08-29T08:00:00+08:00\n");
    writeFileSync(tokenFilePath, "same-token-xyz\n");
    const isProcessAliveOverride = vi.fn().mockReturnValue(true);

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockToken: "same-token-xyz", isProcessAliveOverride })).not.toThrow();
    // AC3's failure mode ai-km-e4 flagged: a re-worded/re-timestamped
    // owner line for the SAME holder must not self-block. Proven here by
    // the fact the match is on the token file, not on parsing/comparing
    // this human-readable line at all.
  });

  it("stale-owner handling (aligned with W3/E04-S056): a dead-PID owner is treated as absent, not blocking, even with no matching token", () => {
    writeFileSync(ownerFilePath, "some-crashed-lane pid=999999999 2026-08-29T00:00:00+08:00\n");
    writeFileSync(tokenFilePath, "irrelevant-token\n");
    const isProcessAliveOverride = vi.fn().mockReturnValue(false);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockToken: undefined, isProcessAliveOverride })).not.toThrow();
      expect(isProcessAliveOverride).toHaveBeenCalledWith(999999999);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("stale"));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("fails closed (blocks) when the owner line's pid cannot be parsed at all — uncertain, not proven stale", () => {
    writeFileSync(ownerFilePath, "a hand-edited line with no pid field\n");
    writeFileSync(tokenFilePath, "some-token\n");
    const isProcessAliveOverride = vi.fn();

    expect(() => assertNotBlockingLockHolder({ ownerFilePath, lockToken: "wrong-token", isProcessAliveOverride })).toThrow();
    expect(isProcessAliveOverride).not.toHaveBeenCalled();
  });

  it("reads ownerFilePath from AI_KM_E2E_OWNER_FILE / lockToken from AI_KM_E2E_LOCK_TOKEN when no explicit options are given", () => {
    const previousOwnerFile = process.env.AI_KM_E2E_OWNER_FILE;
    const previousToken = process.env.AI_KM_E2E_LOCK_TOKEN;
    try {
      writeFileSync(ownerFilePath, "someone-else pid=1 2026-08-29T00:00:00+08:00\n");
      writeFileSync(tokenFilePath, "their-token\n");
      process.env.AI_KM_E2E_OWNER_FILE = ownerFilePath;
      delete process.env.AI_KM_E2E_LOCK_TOKEN;

      expect(() => assertNotBlockingLockHolder({ isProcessAliveOverride: () => true })).toThrow(/someone-else/);
    } finally {
      if (previousOwnerFile === undefined) delete process.env.AI_KM_E2E_OWNER_FILE;
      else process.env.AI_KM_E2E_OWNER_FILE = previousOwnerFile;
      if (previousToken === undefined) delete process.env.AI_KM_E2E_LOCK_TOKEN;
      else process.env.AI_KM_E2E_LOCK_TOKEN = previousToken;
    }
  });
});
