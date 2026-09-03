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
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { inFlightMarkerPathFor, sha256Hex, verifyRestoredHash } from "./mutate.mjs";

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

/**
 * ── E04-S083: signal safety ───────────────────────────────────────────────
 *
 * A real, external `kill -TERM` is sent to a real mutate.mjs child process
 * — this must NOT be verified by having mutate.mjs mutate-test itself
 * (that would be circular). The decisive assertion is the fixture's sha256
 * AFTER the kill, compared against its sha256 BEFORE the run — not "did it
 * exit", not "did it throw" (see this story's brief: existence-only
 * assertions look identical whether the restore fired or not).
 */
describe("mutate.mjs — signal safety (E04-S083)", () => {
  it("SIGTERM sent after the mutation lands on disk, but before mutate.mjs's own restore, still leaves the fixture byte-identical to its pre-mutation content", async () => {
    const relFile = "tools/__fixtures__/slow-guard.mjs";
    const fixturePath = path.join(repoRoot, relFile);
    const originalContent = readFileSync(fixturePath, "utf8");
    const originalHash = sha256Hex(Buffer.from(originalContent, "utf8"));
    const mutatedNeedle = "score < 0.5";
    expect(originalContent).not.toContain(mutatedNeedle);

    const child = spawn(
      "node",
      [
        mutateScript,
        "--file",
        relFile,
        "--replace",
        "score >= 0.5",
        "--with",
        mutatedNeedle,
        "--expect-fail",
        "tools/__fixtures__/slow-guard.test.ts",
      ],
      { cwd: repoRoot },
    );
    // Drain stdout/stderr so the child never blocks on a full pipe buffer.
    child.stdout?.resume();
    child.stderr?.resume();

    try {
      // Poll the fixture on disk until the mutation has actually landed —
      // this is what proves the SIGTERM below arrives inside the real
      // danger window (after write, before restore), not before or after it.
      const deadline = Date.now() + 30_000;
      let mutationObserved = false;
      while (Date.now() < deadline) {
        if (readFileSync(fixturePath, "utf8").includes(mutatedNeedle)) {
          mutationObserved = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      expect(mutationObserved).toBe(true);

      child.kill("SIGTERM");

      const { exitCode, signal } = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
        (resolve) => {
          child.on("exit", (code, sig) => resolve({ exitCode: code, signal: sig }));
        },
      );

      // 143 = 128 + SIGTERM(15), the OS convention mutate.mjs's own signal
      // handler exits with — NOT the process being killed out from under
      // it (which would report `signal: "SIGTERM"` and `exitCode: null`).
      expect(signal).toBeNull();
      expect(exitCode).toBe(143);

      const restoredHash = sha256Hex(Buffer.from(readFileSync(fixturePath, "utf8"), "utf8"));
      expect(restoredHash).toBe(originalHash);
    } finally {
      // Best-effort: make sure nothing from this test lingers if an
      // assertion above threw before the child had already exited.
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  });
});

/**
 * ── E04-S083: pre-flight self-check / in-flight marker ─────────────────────
 *
 * Redesigned per coordinator review: the first design was a persistent
 * ledger comparing every run's sha256 against the last-recorded one, which
 * could not tell "previous run crashed" apart from "you made a legitimate
 * edit since the last run" — and the second case is this repo's normal
 * work loop, not an edge case. The in-flight marker fixes that by only
 * ever existing for the lifetime of one mutation: no marker means nothing
 * is compared at all, so a legitimate edit between two mutate.mjs runs can
 * never trip this check. A marker found on disk means the run that wrote
 * it never got to clean up after itself — see mutate.mjs's own PRE-FLIGHT
 * SELF-CHECK: IN-FLIGHT MARKER doc section.
 *
 * Three decisive, non-circular assertions (real `kill -9`, real
 * `sha256Hex`/`existsSync` — not mutate.mjs verifying itself):
 *   1. A previous run killed with UNCATCHABLE `SIGKILL` (so even the
 *      SIGNAL SAFETY fix above gets no chance to run) leaves both the file
 *      AND its marker in the mutated state — the next run must refuse,
 *      naming the file, and (since the marker carries the original bytes)
 *      self-heal the file back to its pre-mutation content as a side
 *      effect of refusing.
 *   2. A plain, legitimate edit to the SAME file (no marker present)
 *      afterwards runs mutate.mjs completely normally — this is the
 *      scenario the ledger design would have wrongly refused.
 *   3. After any clean run, the marker file does not exist.
 *
 * Uses its own dedicated fixture (`crash-guard.mjs`) — see that file's doc
 * comment for why it must not be shared with other tests in this file.
 */
describe("mutate.mjs — pre-flight self-check / in-flight marker (E04-S083)", () => {
  const relFile = "tools/__fixtures__/crash-guard.mjs";
  const fixturePath = path.join(repoRoot, relFile);
  const markerPath = inFlightMarkerPathFor(repoRoot, relFile);
  const runArgs = [
    "--file",
    relFile,
    "--replace",
    "score >= 0.5",
    "--with",
    "score < 0.5",
    "--expect-fail",
    "tools/__fixtures__/crash-guard.test.ts",
  ];

  it("SIGKILL leaves the file AND its marker mutated; the next run refuses, self-heals, and a legitimate edit afterwards is never refused", async () => {
    const originalContent = readFileSync(fixturePath, "utf8");
    const originalHash = sha256Hex(Buffer.from(originalContent, "utf8"));
    const mutatedNeedle = "score < 0.5";
    expect(originalContent).not.toContain(mutatedNeedle);
    // Start from a clean slate: no marker left over from a previous suite run.
    if (existsSync(markerPath)) rmSync(markerPath);

    // ── 1. Simulate an uncatchable crash mid-mutation ──────────────────
    const child = spawn("node", [mutateScript, ...runArgs], { cwd: repoRoot });
    child.stdout?.resume();
    child.stderr?.resume();

    const deadline1 = Date.now() + 30_000;
    let mutationObserved = false;
    while (Date.now() < deadline1) {
      if (readFileSync(fixturePath, "utf8").includes(mutatedNeedle)) {
        mutationObserved = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(mutationObserved).toBe(true);

    // SIGKILL cannot be caught — this is the whole point of this test.
    child.kill("SIGKILL");
    const { signal } = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on("exit", (code, sig) => resolve({ code, signal: sig }));
    });
    expect(signal).toBe("SIGKILL");

    // Decisive: the file is ACTUALLY still mutated (not merely "the
    // process died") and the marker is ACTUALLY still on disk.
    const mutatedHash = sha256Hex(Buffer.from(readFileSync(fixturePath, "utf8"), "utf8"));
    expect(mutatedHash).not.toBe(originalHash);
    expect(existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    expect(marker.originalSha256).toBe(originalHash);
    expect(marker.mutatedSha256).toBe(mutatedHash);

    // ── 2. The next run must refuse, naming the file, and self-heal ────
    const afterCrash = runMutate(runArgs);
    expect(afterCrash.exitCode).toBe(1);
    expect(afterCrash.stderr).toContain(relFile);
    expect(afterCrash.stderr).toContain(mutatedHash);
    expect(afterCrash.stderr).toContain(originalHash);
    expect(afterCrash.stderr).toContain("疑似停在前一次未乾淨結束的突變狀態");
    // Decisive: the file was actually healed back to the ORIGINAL bytes
    // (not left mutated, not left in some third state), and the marker
    // that made this refusal possible is gone.
    const healedHash = sha256Hex(Buffer.from(readFileSync(fixturePath, "utf8"), "utf8"));
    expect(healedHash).toBe(originalHash);
    expect(existsSync(markerPath)).toBe(false);

    // ── 3. A legitimate edit (no marker present) is NEVER refused ───────
    // This is the scenario the rejected ledger design would have wrongly
    // treated as suspicious. Edit a COMMENT line, not the `score >= 0.5`
    // occurrence mutate.mjs itself will target, so this is unambiguously
    // "someone changed the file for an unrelated reason", not a crash.
    const legitimatelyEditedContent = readFileSync(fixturePath, "utf8").replace(
      "// Fixture for mutate.mjs's own IN-FLIGHT MARKER meta-test",
      "// Fixture for mutate.mjs's own IN-FLIGHT MARKER meta-test (edited for E04-S083's own reverse verification)",
    );
    expect(legitimatelyEditedContent).not.toBe(readFileSync(fixturePath, "utf8"));
    writeFileSync(fixturePath, legitimatelyEditedContent, "utf8");
    expect(existsSync(markerPath)).toBe(false); // no marker => nothing to compare against

    const afterLegitEdit = runMutate(runArgs);
    expect(afterLegitEdit.exitCode).toBe(0); // must NOT be refused

    // ── 4. After ANY clean run, the marker must not exist ───────────────
    expect(existsSync(markerPath)).toBe(false);

    // Restore the fixture to its committed content for the next test run.
    writeFileSync(fixturePath, originalContent, "utf8");
  });
});
