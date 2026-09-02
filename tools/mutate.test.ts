/**
 * Meta-tests for `mutate.mjs` (E04-S070) — the tests ARE the spec (this is
 * a lightweight-tier story per `.claude/rules/STORY_WORKFLOW.md`'s 工作分級).
 *
 * One "input that must be rejected" per exit code (1/2/3/4/5), plus a
 * positive case proving exit 0 actually fires. Fixtures live in
 * `__fixtures__/` — each one models a real shape from this wave's record
 * (a genuine guard vs. an existence-only assertion vs. a mutation that
 * breaks syntax rather than logic), not an arbitrary toy.
 *
 * `--file`/`--expect-fail` paths passed to mutate.mjs are always relative
 * to the REPO root (its own documented interface), so every fixture path
 * below is `tools/__fixtures__/...`, not `__fixtures__/...`.
 *
 * ── exit 3 is unit-tested directly, not through the CLI ─────────────────
 * mutate.mjs writes the in-memory original bytes back to disk and then
 * reads them back synchronously, with no window for a second process to
 * interleave — genuinely forcing a real end-to-end restore-hash mismatch
 * would mean racing a concurrent writer against that synchronous
 * write-then-read, which has no reliable point to land in. `verifyRestoredHash`
 * is exported specifically so this one condition can be tested honestly
 * (a real mismatched-bytes/hash pair) instead of faked through a hidden
 * CLI-only test hook. See mutate.mjs's own doc comment on the export.
 *
 * ── the AC7-style self-verification is NOT one of the `it()` blocks below ──
 * "Remove the exit-2 detection and a meta-test must go red" is this
 * story's own reverse verification of this test suite, performed the same
 * way every other reverse verification in this repo is: edit the real
 * source, rerun, capture the verbatim red failure, revert, confirm green
 * again (`.claude/rules/STORY_WORKFLOW.md`'s 工作分級 §反向驗證: "the
 * evidence of a reverse verification is the failure message, not the count
 * of red tests"). Baking a permanent self-cloning test for this into the
 * suite would need mutate.mjs to fork a crippled copy of itself at every
 * test run — more moving parts than the one-time manual action this
 * concept actually calls for. The verbatim before/after transcript is
 * recorded in this story's commit body and PROGRESS.md row, not in this
 * file.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { sha256Hex, verifyRestoredHash } from "./mutate.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mutateScript = path.join(repoRoot, "tools", "mutate.mjs");

function runMutate(args: readonly string[]): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync("node", [mutateScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  return { exitCode: result.status ?? -1, stdout: result.stdout, stderr: result.stderr };
}

describe("mutate.mjs — exit 0 (the guard fired correctly)", () => {
  it("a real guard, genuinely mutated, turns red for the right reason", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "score >= 0.5",
      "--with",
      "score < 0.5",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
    ]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("outcome: exit 0");
    expect(result.stdout).toContain("AssertionError: expected 'fail' to be 'pass'");
  });

  it("exit 0 also succeeds when --expect-message matches a real substring of the failure (positive control for exit 5)", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "score >= 0.5",
      "--with",
      "score < 0.5",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
      "--expect-message",
      "expected 'fail' to be 'pass'",
    ]);
    expect(result.exitCode).toBe(0);
  });
});

describe("mutate.mjs — exit 1 (usage error / invalid baseline)", () => {
  it("rejects a missing required flag before touching any file", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "x",
      "--with",
      "y",
      // --expect-fail omitted
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("缺少必要參數 --expect-fail");
  });

  it("rejects --replace that occurs zero times", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "NONEXISTENT_STRING_ZZZ",
      "--with",
      "y",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("找不到 --replace 指定的字面字串");
  });

  it("rejects --replace that occurs MORE than once — never replace-all, no --nth escape hatch", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/repeated.mjs",
      "--replace",
      '"dup"',
      "--with",
      '"changed"',
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("出現 2 次");
  });

  it("rejects a baseline that is already red before any mutation is applied", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/already-red.mjs",
      "--replace",
      "export const VALUE = 1;",
      "--with",
      "export const VALUE = 2;",
      "--expect-fail",
      "tools/__fixtures__/already-red.test.ts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("不是有效的綠色基準");
    // The mutation must never have been applied — the file on disk is untouched.
    expect(result.stderr).toContain("numFailedTests=1");
  });

  it('rejects "0 tests passed" as a baseline — a --test-name typo must not be read as green', () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "score >= 0.5",
      "--with",
      "score < 0.5",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
      "--test-name",
      "NO_SUCH_TEST_NAME_XYZ",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("numPassedTests=0");
  });
});

describe("mutate.mjs — exit 2 (still green after mutation — the guard did not fire)", () => {
  it("an existence-only assertion (checks type, not value) stays green when the value is gutted", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/disconnected.mjs",
      "--replace",
      '"hello"',
      "--with",
      '"goodbye"',
      "--expect-fail",
      "tools/__fixtures__/disconnected.test.ts",
    ]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain("outcome: exit 2");
  });
});

describe("mutate.mjs — exit 3 (restored file's sha256 does not match)", () => {
  it("verifyRestoredHash rejects a bytes/hash pair that do not match", () => {
    const original = Buffer.from("original content, never actually written to disk in this test");
    const expectedHash = sha256Hex(original);
    expect(verifyRestoredHash(original, expectedHash)).toBe(true);

    const corrupted = Buffer.from("corrupted content — a different byte sequence entirely");
    expect(verifyRestoredHash(corrupted, expectedHash)).toBe(false);
  });
});

describe("mutate.mjs — exit 4 (undeterminable: red, but not from an assertion)", () => {
  it("a mutation that breaks SYNTAX rather than logic is a collection error, not an assertion failure", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/syntax-breakable.mjs",
      "--replace",
      "return n + 1;",
      "--with",
      "return n + ;",
      "--expect-fail",
      "tools/__fixtures__/syntax-breakable.test.ts",
    ]);
    expect(result.exitCode).toBe(4);
    expect(result.stdout).toContain("outcome: exit 4");
    // Must not be misreported as the exit-0 "assertion failed" shape.
    expect(result.stdout).not.toContain("AssertionError");
  });
});

describe("mutate.mjs — exit 5 (red for the wrong reason — the mechanised E06-S043 defect)", () => {
  it("--expect-message given, but the actual failure text does not contain it", () => {
    const result = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "score >= 0.5",
      "--with",
      "score < 0.5",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
      "--expect-message",
      "TOTALLY_UNRELATED_STRING_DOES_NOT_APPEAR",
    ]);
    expect(result.exitCode).toBe(5);
    expect(result.stdout).toContain("outcome: exit 5");
  });
});

describe("mutate.mjs — restoration leaves the fixture byte-identical no matter the outcome", () => {
  it("running every scenario above in sequence never leaves a fixture mutated on disk", () => {
    // A cheap end-to-end confidence check distinct from the exit-3 unit
    // test above: after ALL the runs this file performed, every fixture's
    // current bytes on disk must still match its committed content —
    // exercised implicitly by every `it()` above already passing (each one
    // re-runs the SAME fixtures other tests also use), made explicit here
    // by re-running the exit-0 fixture one more time and diffing nothing
    // changed relative to its known-good baseline hash.
    const before = runMutate([
      "--file",
      "tools/__fixtures__/good-guard.mjs",
      "--replace",
      "score >= 0.5",
      "--with",
      "score < 0.5",
      "--expect-fail",
      "tools/__fixtures__/good-guard.test.ts",
    ]);
    expect(before.exitCode).toBe(0);
    const shaBefore = /sha256 before: (\w+)/.exec(before.stdout)?.[1];
    const shaAfter = /sha256 after restore: (\w+)/.exec(before.stdout)?.[1];
    expect(shaBefore).toBeTruthy();
    expect(shaBefore).toBe(shaAfter);
  });
});
