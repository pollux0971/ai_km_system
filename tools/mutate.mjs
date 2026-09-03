#!/usr/bin/env node
/**
 * `mutate.mjs` — a mechanical reverse-verification runner (E04-S070).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────
 *
 * This wave's record has five cases of "passed for the wrong reason", and
 * every one was a blind spot in a HUMAN reverse verification — someone read
 * a count, or a job status, and stopped. The sharpest was E06-S043: the
 * right assertion existed, was correctly written, and could not be
 * reached, while the red count was identical either way (7 failed / 34
 * passed, both before and after the fix). A human staring at "7 failed"
 * has no way to tell those two runs apart. This tool's answer to exactly
 * that is `--expect-message`: it compares the FAILURE TEXT, not the exit
 * code or the count of red tests.
 *
 * ── WHAT IT DOES ─────────────────────────────────────────────────────────
 *
 *   1. Read `--file`'s bytes, sha256 them.
 *   2. Require `--replace` to occur in that file EXACTLY ONCE. Zero or more
 *      than one occurrence is refused — never replace-all, and (unlike the
 *      tool this is modelled on) there is no `--nth` escape hatch.
 *   3. Run the baseline FIRST (before touching anything): `--expect-fail`
 *      must already be green, AND must have actually collected/passed at
 *      least one test — "0 tests passed" is not a baseline (a `--test-name`
 *      typo makes every test "skipped", vitest still exits 0, and a naive
 *      check on exit code alone would wrongly call that a green baseline).
 *   4. Apply the mutation (single occurrence, in memory, then write to disk).
 *   5. Run vitest DIRECTLY — `pnpm --filter <pkg> exec vitest run <file> ...`
 *      — never through turbo. A warm turbo cache replays old task results;
 *      it would manufacture exactly the false negative this tool exists to
 *      catch (a mutated file whose test result turbo still reports as the
 *      pre-mutation green, because turbo never re-ran anything).
 *   6. Parse vitest's JSON reporter output and classify the result as
 *      `passed` / `assertion_failed` / `collection_error` — an assertion
 *      failure (the guard fired) and a collection/unhandled error (a syntax
 *      error, an import that now throws, etc.) mean completely different
 *      things and must not be conflated into one "red" bucket.
 *   7. Restore the file from the ORIGINAL IN-MEMORY BYTES (never
 *      `git checkout`, never a WIP commit — this tool must never touch git
 *      state) and verify the restored bytes sha256 back to the original.
 *   8. Re-run once more after restoring, to confirm the file is green again.
 *   9. Print an evidence block that pastes straight into a commit body.
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────
 *
 *   0 — the guard fired correctly (mutated → real assertion failure).
 *   1 — usage error: bad/missing arguments, `--file` not found, `--replace`
 *       not found or not exactly one occurrence, the baseline wasn't a
 *       valid green (not green, or "0 tests passed"), or an environment
 *       failure (pnpm/vitest could not even be launched, or the post-
 *       restore re-green-check unexpectedly failed despite a byte-identical
 *       restore — both bucketed here as "the tool could not establish a
 *       trustworthy baseline/end-state", not as a finding about the code).
 *   2 — STILL GREEN after mutation: the guard did not fire. The file is
 *       restored; this is a report about the test, not a crash.
 *   3 — the restored file's sha256 does not match the original. Should be
 *       unreachable in normal operation (restoring in-memory bytes and
 *       reading them back has no room for drift) — kept as a loud,
 *       independent invariant check rather than trusting the write blindly.
 *   4 — undeterminable: red, but NOT from an assertion (a collection error
 *       — syntax error, a throw during module import, etc.). This is not
 *       evidence the guard fired; it is evidence the run itself broke.
 *   5 — `--expect-message` was given and the actual failure message does
 *       not contain it: red, but for the WRONG REASON. This is the
 *       mechanised form of the E06-S043 defect this tool exists to catch.
 *
 *   Signals (SIGHUP/SIGINT/SIGTERM) are handled OUTSIDE this 0-5 space —
 *   see SIGNAL SAFETY below — and exit with the OS convention 128+signum
 *   (129/130/143) instead, so a caller inspecting the exit code can always
 *   tell "the guard tool finished its own classification" (0-5) apart from
 *   "something external killed it mid-run" (128+n).
 *
 * ── SIGNAL SAFETY (E04-S083) ─────────────────────────────────────────────
 *
 * The `finally` block that restores the file (step 7 above) only runs for
 * a JS exception; a killing signal skips it entirely. This was found in
 * production on 2026-09-03: a `good-guard.mjs`-shaped fixture was left
 * mutated on disk because the process that was mutating it never reached
 * its own `finally`.
 *
 * CORRECTION to this story's own registration: the root cause was
 * originally written down as "the whole file has no SIGINT/SIGTERM
 * handler." That is NECESSARY but not SUFFICIENT — adding a handler alone
 * would have produced a fix that never fires, the same shape as this
 * wave's `flock` defect ("a fix written against an assumed mechanism
 * instead of a measured one never triggers"). The handler only helps if
 * the process is actually free to run it; see point 1 below for why it
 * wasn't.
 *
 * The fix has two parts, and the first one is less trivial than it looks:
 *
 *   1. `process.on("SIGINT"/"SIGTERM"/"SIGHUP", ...)` alone is NOT enough.
 *      Empirically verified while building this fix: a signal handler
 *      registered this way is NOT invoked while the process is blocked
 *      inside a synchronous `child_process.spawnSync` call — which is
 *      exactly the window where the file sits mutated on disk (steps 5/6,
 *      running the mutated code under vitest). `spawnSync` blocks Node's
 *      own event loop, and the loop is what delivers queued signal
 *      callbacks; a `kill -TERM` sent during that window is silently lost
 *      (confirmed with a minimal repro: the child ran to completion and
 *      the handler never fired). So this file no longer calls `spawnSync`
 *      for the vitest child — `runVitestJson` now uses async `spawn`
 *      instead, keeping the event loop free so the registered handler
 *      actually gets to run promptly when a signal arrives mid-run.
 *   2. The mutation state (`activeMutation`: the absolute path + the
 *      original bytes) is promoted to MODULE scope so a signal handler —
 *      which cannot be a closure over `run()`'s locals — can still reach
 *      it. `restoreActiveMutation()` is idempotent (guarded by
 *      `activeMutation` being non-null, then immediately nulled out), so
 *      it is safe to call from both the signal handler and `run()`'s own
 *      `finally` — whichever runs first does the actual write; the other
 *      is a no-op. A signal that arrives before any mutation exists
 *      (`activeMutation === null`) restores nothing and reports nothing
 *      wrong — there is nothing to undo yet.
 *
 * On a caught signal: restore-if-mutated, best-effort `kill()` the
 * in-flight vitest child (it is `pnpm --filter <pkg> exec vitest`, which
 * itself forks a further vitest process — killing the immediate child does
 * NOT guarantee that grandchild dies too; a stricter process-group kill
 * was judged out of scope for this fix and is noted here rather than
 * silently assumed away), then `process.exit(128 + signum)`.
 *
 * ── PRE-FLIGHT SELF-CHECK: IN-FLIGHT MARKER (E04-S083, redesigned) ────────
 *
 * A signal handler only helps for signals this process can catch. A
 * `SIGKILL`, a power loss, or an OOM kill leaves the file mutated on disk
 * with NO chance for any in-process code to run at all. The next time
 * anyone points `mutate.mjs` at that same file, every downstream
 * measurement (the "baseline" run, the sha256 "before") would silently be
 * taken against an already-corrupted starting point.
 *
 * FIRST DESIGN (rejected on review, kept here as a recorded dead end): a
 * persistent ledger recording the last-known-clean sha256 for every file
 * ever targeted, compared on every run. It worked, but it could not tell
 * "the previous run crashed without restoring" apart from "you edited this
 * file yourself, on purpose, for an unrelated reason, since the last time
 * mutate.mjs touched it" — both look identical (current sha256 != last
 * recorded sha256). In THIS repo that second case is not an edge case, it
 * is the normal work loop (write test → write implementation → mutate to
 * verify the guard → fix the implementation → mutate again) — a persistent
 * ledger would refuse to start on almost every real invocation, training
 * whoever hits it to reflexively delete the ledger file, which destroys
 * the exact protection it exists to provide (same shape as "an
 * intermittent red that trains people to just re-run it" from E04-S082's
 * brief — just relocated to a different check).
 *
 * FIX: an IN-FLIGHT MARKER instead of a standing baseline. The marker
 * exists ONLY for the lifetime of one mutation and is written to
 * `tools/.mutate-inflight/<relFile-with-/-replaced-by-__>.json`
 * (gitignored — local machine state, not a repo artifact):
 *
 *   - Written right BEFORE the mutated bytes are written to `--file`,
 *     containing `{ file, originalSha256, mutatedSha256, originalBytesBase64,
 *     recordedAt }` — the sha256 of both the pre- and post-mutation content,
 *     plus the original bytes themselves so the tool can heal the file, not
 *     just diagnose it.
 *   - Deleted the instant the file is restored — by `restoreActiveMutation`,
 *     the SAME function the signal handler and the normal `finally` both
 *     call (see SIGNAL SAFETY above), so the marker's lifetime is bound to
 *     `activeMutation`'s.
 *
 * On the NEXT invocation, BEFORE touching anything: no marker for this file
 * → proceed unconditionally, no comparison at all. A legitimate edit made
 * between two mutate.mjs runs never has a marker sitting around, so it can
 * never trip this check — this is the property the ledger design didn't
 * have. A marker found present means the run that wrote it never reached
 * its own cleanup — compare the file's CURRENT sha256 against the two
 * hashes recorded in the marker:
 *
 *   - Matches `originalSha256` → that previous run's restore actually
 *     succeeded; it just died before deleting its own marker. Harmless —
 *     delete the stale marker and proceed normally.
 *   - Matches `mutatedSha256` → exactly the failure mode this exists to
 *     catch: the file is still sitting in mutated content from a run that
 *     never got to restore it (a SIGKILL, an OOM kill, a crashed machine).
 *     Refuse to start (exit 1), naming the file and both hashes. The
 *     marker carries the original bytes, so the tool restores the file
 *     from them and deletes the marker as part of refusing — it heals
 *     itself; the refusal is only about not silently proceeding to layer a
 *     NEW mutation on top of an invocation nobody asked for right now, not
 *     about needing a human to manually fix the bytes.
 *   - Matches NEITHER → an unrecognised state (the file was edited to some
 *     THIRD content while a marker sat there) — refuse (exit 1), report
 *     both recorded hashes and the current one, and leave the file alone;
 *     this case is ambiguous enough that auto-healing would be a guess.
 *
 * ── PROVENANCE ───────────────────────────────────────────────────────────
 *
 * The shape is borrowed from `/data/python/nightmare-assault/dev/tools/
 * mutate.py` (rewritten from scratch for this repo — no code carried over).
 * Four deliberate differences from that tool:
 *
 *   1. No commit is EVER created. The python tool auto-WIP-commits an
 *      uncommitted target file before mutating it, specifically so the
 *      restore step can be a safe `git show <sha>:<path>`. This tool
 *      restores from bytes held in the process's own memory instead, so it
 *      never needs to touch git at all — no WIP commit, no requirement that
 *      the file even be tracked by git.
 *   2. Exactly-one-occurrence enforcement has no override. The python tool
 *      accepts `--nth N` to pick one occurrence out of several; this
 *      interface has no such flag — zero or multiple occurrences of
 *      `--replace` is always a hard refusal, full stop.
 *   3. Never routed through turbo. The python tool shells out to `pytest`
 *      directly (Python has no turbo-like task cache in this picture); this
 *      tool's equivalent decision is explicit and load-bearing here because
 *      the obvious/lazy invocation in THIS repo would be `turbo run test`,
 *      and turbo's cache would silently replay a stale (pre-mutation)
 *      result — so this tool always calls `pnpm --filter <pkg> exec vitest`
 *      directly, bypassing turbo entirely.
 *   4. JSON-reporter-based classification of failures. The python tool
 *      distinguishes outcomes by pytest's process EXIT CODE (0/1/2/3/4/5
 *      map to distinct pytest meanings). Vitest does not expose an
 *      equivalently fine-grained exit code (it is 0-or-1), so this tool
 *      parses vitest's own `--reporter=json` output instead, to tell an
 *      assertion failure apart from a collection/unhandled error.
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync, unlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Thrown for every exit-1 condition (usage / baseline / environment). */
export class UsageError extends Error {}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Every (non-overlapping, `String.prototype.split`-semantics) occurrence of
 * `needle` in `text`, as 1-indexed line numbers — used both to enforce
 * "exactly once" and, when that fails, to tell the caller exactly where the
 * offending occurrences are instead of just a count.
 */
export function findOccurrences(text, needle) {
  if (needle.length === 0) {
    throw new UsageError("--replace 不得為空字串。");
  }
  const offsets = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx === -1) break;
    offsets.push(idx);
    from = idx + needle.length;
  }
  return offsets.map((offset) => ({
    offset,
    line: text.slice(0, offset).split("\n").length,
  }));
}

/** Apply a single-occurrence literal replacement at a known offset. */
export function applyMutationAt(text, offset, replace, withText) {
  return text.slice(0, offset) + withText + text.slice(offset + replace.length);
}

/**
 * `verifyRestoredHash` is exercised directly (not just through the CLI) by
 * `mutate.test.ts`'s exit-3 meta-test: forcing an ACTUAL restore to
 * mismatch end-to-end would require racing a second process against this
 * tool's synchronous write-then-read-back with no real window to land in
 * (see the meta-test's own comment) — so exit 3's *detection* is unit
 * tested directly against a deliberately-wrong pair, honestly, rather than
 * faked through a hidden test-only CLI flag.
 */
export function verifyRestoredHash(actualBytes, expectedHash) {
  return sha256Hex(actualBytes) === expectedHash;
}

/**
 * Classify one `vitest run --reporter=json` report.
 *
 * `assertion_failed` — at least one assertion in the run actually failed:
 *   the guard fired. `failureMessage` is that assertion's own message
 *   (vitest's `failureMessages[0]`, e.g. `"AssertionError: expected 0 to be
 *   greater than 0"`).
 * `collection_error` — the run did not go green, but not because an
 *   assertion failed (`assertionResults` collected nothing "failed"): a
 *   syntax error, a throw during module import, or similar. `failureMessage`
 *   is the file-level `message` vitest attached to the failed test file.
 * `passed` — every assertion vitest actually ran came back green.
 */
export function classifyVitestJsonReport(report) {
  const testResults = Array.isArray(report.testResults) ? report.testResults : [];
  const allAssertions = testResults.flatMap((fileResult) =>
    Array.isArray(fileResult.assertionResults) ? fileResult.assertionResults : [],
  );
  const failedAssertions = allAssertions.filter((a) => a.status === "failed");
  if (failedAssertions.length > 0) {
    const first = failedAssertions[0];
    const messages = Array.isArray(first.failureMessages) ? first.failureMessages : [];
    const failureMessage = messages[0] ?? "(vitest 回報這個斷言 failed,但沒有附上 failureMessages)";
    return { outcome: "assertion_failed", failureMessage, report };
  }
  if (report.success === false) {
    const fileLevelMessage = testResults
      .filter((fileResult) => fileResult.status === "failed")
      .map((fileResult) => fileResult.message)
      .find((message) => typeof message === "string" && message.length > 0);
    return {
      outcome: "collection_error",
      failureMessage: fileLevelMessage ?? "(vitest 回報 success:false,但沒有任何 failed assertion 也沒有檔案層級 message)",
      report,
    };
  }
  return { outcome: "passed", failureMessage: null, report };
}

/** True only for a baseline that is both green AND actually ran something. */
export function isValidGreenBaseline(report) {
  return (
    report.success === true &&
    typeof report.numPassedTests === "number" &&
    report.numPassedTests > 0 &&
    typeof report.numFailedTests === "number" &&
    report.numFailedTests === 0
  );
}

function firstLine(message) {
  return String(message).split("\n")[0];
}

/**
 * ── Module-scope signal-safety state (E04-S083) ──────────────────────────
 * `activeMutation` holds `{ absFile, origBytes, markerPath }` for exactly
 * as long as the mutated bytes are on disk and un-restored; `null`
 * otherwise. It has to live here, not inside `run()`, because a signal
 * handler cannot close over a specific call's local variables — it is
 * registered once and must be able to see whatever `run()` is doing right
 * now. `markerPath` (see the in-flight marker functions below) travels
 * with it so the SAME restore call also cleans up the marker — the
 * marker's lifetime is bound to `activeMutation`'s by construction, not by
 * two places remembering to stay in sync. `activeChild` is the currently
 * in-flight vitest child process (if any), kept so a signal handler can
 * also try to stop it rather than leaving it to run to completion in the
 * background after this process has already exited.
 */
let activeMutation = null;
let activeChild = null;

/**
 * Idempotent by construction: the first caller to see `activeMutation !==
 * null` performs the write (and the marker cleanup) and immediately nulls
 * the module state; any later caller (the signal handler firing after
 * `run()`'s own `finally` already restored, or vice versa) sees `null` and
 * does nothing. Returns the absolute path that was restored, or `null` if
 * there was nothing to restore (either already restored, or a signal
 * arrived before any mutation had been written at all).
 */
function restoreActiveMutation() {
  if (activeMutation === null) return null;
  const { absFile, origBytes, markerPath } = activeMutation;
  writeFileSync(absFile, origBytes);
  if (markerPath) {
    try {
      unlinkSync(markerPath);
    } catch {
      // best-effort — a missing marker at this point is not an error.
    }
  }
  activeMutation = null;
  return absFile;
}

/** OS convention: a caught, fatal signal exits with 128 + signal number. */
const SIGNAL_EXIT_CODES = { SIGHUP: 129, SIGINT: 130, SIGTERM: 143 };

/**
 * Registers SIGHUP/SIGINT/SIGTERM handlers that restore-if-mutated (see
 * `restoreActiveMutation`), best-effort stop the in-flight vitest child,
 * and exit with the OS-conventional 128+signum code. Returns an
 * uninstall function so `run()` can clean up after itself instead of
 * leaking listeners if it is ever invoked more than once in one process
 * (the CLI entrypoint below always exits right after, so this mostly
 * matters for future in-process/test callers of `run()`).
 *
 * Only registered for the duration of `run()` — NOT at module import time
 * — so importing `sha256Hex`/`verifyRestoredHash` etc. (as
 * `mutate.test.ts` does, without calling `run()`) never attaches signal
 * listeners to whatever process did the importing (e.g. the vitest worker
 * running that very test file).
 */
function installSignalHandlers() {
  const installed = [];
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    const handler = () => {
      const restoredFile = restoreActiveMutation();
      if (restoredFile !== null) {
        console.error(`[mutate.mjs] 收到 ${signal},已將 ${restoredFile} 還原為突變前的原始內容後結束。`);
      } else {
        console.error(`[mutate.mjs] 收到 ${signal},結束(此時沒有任何檔案處於突變狀態,無需還原)。`);
      }
      if (activeChild) {
        try {
          activeChild.kill(signal);
        } catch {
          // best-effort only — see module docstring's SIGNAL SAFETY section
          // on why killing the immediate child does not guarantee its own
          // grandchild vitest process also dies.
        }
      }
      process.exit(SIGNAL_EXIT_CODES[signal]);
    };
    process.on(signal, handler);
    installed.push([signal, handler]);
  }
  return () => {
    for (const [signal, handler] of installed) {
      process.off(signal, handler);
    }
  };
}

/**
 * In-flight marker path for a target file: `tools/.mutate-inflight/<relFile
 * with "/" replaced by "__">.json`. Kept under `tools/` (not `tmpdir()`)
 * because it must survive between separate invocations on the same
 * machine — that is the entire point of a crash-recovery marker — and
 * `tmpdir()` offers no such guarantee. Gitignored: local-machine state
 * about an in-progress (or crashed) mutation, not a repo artifact.
 */
export function inFlightMarkerPathFor(repoRoot, relFile) {
  const safeName = relFile.replace(/[\\/]/g, "__");
  return path.join(repoRoot, "tools", ".mutate-inflight", `${safeName}.json`);
}

/**
 * Writes the in-flight marker BEFORE the mutated bytes are written to
 * `absFile` (see call site in `run()`) — so even a crash landing between
 * this write and the mutation write leaves a marker whose `mutatedSha256`
 * simply never gets matched (the file is still original), which the
 * pre-flight check below treats as the harmless "previous run didn't even
 * get to mutate" case. Stores the original bytes (base64) alongside both
 * hashes so a future run can self-heal instead of merely diagnosing.
 */
function writeInFlightMarker(markerPath, relFile, origBytes, originalSha256, mutatedSha256) {
  mkdirSync(path.dirname(markerPath), { recursive: true });
  writeFileSync(
    markerPath,
    JSON.stringify(
      {
        file: relFile,
        originalSha256,
        mutatedSha256,
        originalBytesBase64: origBytes.toString("base64"),
        recordedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

/**
 * The pre-flight self-check (E04-S083, redesigned per coordinator review —
 * see module docstring's PRE-FLIGHT SELF-CHECK: IN-FLIGHT MARKER section
 * for the full design, including the rejected persistent-ledger design
 * this replaces and why). Must run BEFORE anything else touches `absFile`.
 * Throws `UsageError` (exit 1) when a stale marker proves the file is
 * still sitting in mutated content from an interrupted previous run,
 * or when the marker's recorded state can't explain the current content
 * at all; otherwise (no marker, or a stale-but-harmless marker) cleans up
 * and returns normally — NEVER writes anything for the common case of "no
 * marker exists", so a legitimate edit made between two mutate.mjs runs
 * can never trip this check.
 */
function checkNoStaleInFlightMarker(repoRoot, absFile, relFile, currentHash) {
  const markerPath = inFlightMarkerPathFor(repoRoot, relFile);
  if (!existsSync(markerPath)) return;

  let marker;
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch (err) {
    throw new UsageError(
      `${relFile} 有一個殘留的突變中標記(${markerPath})但無法解析為 JSON:${err.message}。` +
        `請手動核對 ${relFile} 目前內容是否正確,確認後刪除這個標記檔再重跑。`,
    );
  }

  if (currentHash === marker.originalSha256) {
    // The previous run's restore actually succeeded — it just died before
    // deleting its own marker. Harmless; clean up and proceed.
    try {
      unlinkSync(markerPath);
    } catch {
      // best-effort
    }
    return;
  }

  if (currentHash === marker.mutatedSha256) {
    // Exactly the failure mode this check exists to catch: the file is
    // still sitting in mutated content from a run that never reached its
    // own restore (SIGKILL, OOM kill, a crashed machine — anything this
    // process could not have caught even with the SIGNAL SAFETY fix above).
    let healed = false;
    if (typeof marker.originalBytesBase64 === "string") {
      try {
        writeFileSync(absFile, Buffer.from(marker.originalBytesBase64, "base64"));
        unlinkSync(markerPath);
        healed = true;
      } catch {
        healed = false;
      }
    }
    throw new UsageError(
      `${relFile} 疑似停在前一次未乾淨結束的突變狀態(process 被中斷、SIGKILL、機器重開,或某次突變` +
        `沒有被還原乾淨):目前 sha256(${currentHash})等於上次記錄的突變後值(${marker.mutatedSha256}),` +
        `原始值應為 ${marker.originalSha256}。` +
        (healed
          ? `本工具已用標記裡保存的原始內容自動把 ${relFile} 還原,並清除殘留的標記(${markerPath})` +
            `——請重新執行剛才的指令。`
          : `本工具無法自動還原(標記未附帶可用的原始內容),請手動核對後還原 ${relFile},並刪除 ${markerPath}。`),
    );
  }

  // Neither original nor mutated — an unrecognised state. Auto-healing
  // here would be a guess; report both recorded hashes and refuse.
  throw new UsageError(
    `${relFile} 有一個殘留的突變中標記(${markerPath}),但目前 sha256(${currentHash})既不等於標記` +
      `記錄的原始值(${marker.originalSha256})也不等於突變後值(${marker.mutatedSha256})——無法判斷` +
      `安全的下一步,拒絕開始。請手動核對 ${relFile} 目前的內容,視情況還原後刪除這個標記檔再重跑。`,
  );
}

/** Walk up from `startDir` looking for the pnpm workspace root marker. */
function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new UsageError(
        `從 ${startDir} 往上找不到 repo root(找不到 pnpm-workspace.yaml)。`,
      );
    }
    dir = parent;
  }
}

/** Nearest ancestor package.json (with a "name" field) for `absPath`, bounded by `repoRoot`. */
function findOwningPackage(absPath, repoRoot) {
  let dir = statSync(absPath).isDirectory() ? absPath : path.dirname(absPath);
  for (;;) {
    const pkgJsonPath = path.join(dir, "package.json");
    if (existsSync(pkgJsonPath)) {
      let pkg;
      try {
        pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      } catch (err) {
        throw new UsageError(`${pkgJsonPath} 不是合法的 JSON:${err.message}`);
      }
      if (typeof pkg.name === "string" && pkg.name.length > 0) {
        return { pkgDir: dir, pkgName: pkg.name };
      }
    }
    if (dir === repoRoot) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new UsageError(`從 ${absPath} 往上找不到帶 "name" 欄位的 package.json(repo root:${repoRoot})。`);
}

/**
 * Run `pnpm --filter <pkg> exec vitest run <absTestFile> [-t <name>]
 * --reporter=json --outputFile=<tmp>` from `repoRoot`, DIRECTLY — never
 * `pnpm turbo run test` / `turbo run test` — and return the parsed JSON
 * report. `--outputFile` (not stdout) is deliberate: on a failing run, pnpm
 * itself appends its own `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` diagnostic
 * text after vitest's JSON on stdout, which is no longer valid JSON —
 * `--outputFile` writes vitest's report to a file pnpm never touches.
 *
 * ASYNC, via `spawn` — deliberately NOT `spawnSync` (see module docstring's
 * SIGNAL SAFETY section: a `spawnSync` call blocks Node's own event loop,
 * and that loop is what a registered `process.on("SIGTERM", ...)` handler
 * needs in order to run at all — verified empirically that a signal sent
 * while blocked inside `spawnSync` is simply never delivered to the
 * handler). The child is recorded on `activeChild` for the duration of the
 * run so a signal handler elsewhere in this module can best-effort stop it.
 */
function runVitestJson({ repoRoot, pkgName, absTestFile, testName }) {
  const outFile = path.join(tmpdir(), `mutate-mjs-${randomUUID()}.json`);
  const args = ["--filter", pkgName, "exec", "vitest", "run", absTestFile];
  if (testName) args.push("-t", testName);
  args.push("--reporter=json", `--outputFile=${outFile}`);
  const commandLine = `pnpm ${args.join(" ")}`;

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn("pnpm", args, { cwd: repoRoot });
    } catch (err) {
      reject(new UsageError(`啟動 vitest 失敗(${commandLine}):${err.message}`));
      return;
    }
    activeChild = child;

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (activeChild === child) activeChild = null;
      reject(new UsageError(`啟動 vitest 失敗(${commandLine}):${err.message}`));
    });

    child.on("close", (status) => {
      if (activeChild === child) activeChild = null;

      let raw;
      try {
        raw = readFileSync(outFile, "utf8");
      } catch (err) {
        reject(
          new UsageError(
            `vitest 沒有寫出 JSON 報告(${commandLine},process exit code ${status})。` +
              `stdout 尾段:\n${stdout.split("\n").slice(-20).join("\n")}\n` +
              `stderr 尾段:\n${stderr.split("\n").slice(-20).join("\n")}\n原始錯誤:${err.message}`,
          ),
        );
        return;
      } finally {
        try {
          unlinkSync(outFile);
        } catch {
          // best-effort cleanup only
        }
      }

      let report;
      try {
        report = JSON.parse(raw);
      } catch (err) {
        reject(new UsageError(`vitest 的 JSON 報告無法解析(${commandLine}):${err.message}\n原始內容:\n${raw}`));
        return;
      }
      resolve({ report, commandLine });
    });
  });
}

function parseArgs(argv) {
  const out = { file: null, replace: null, with: null, expectFail: null, testName: null, expectMessage: null };
  const flagToKey = {
    "--file": "file",
    "--replace": "replace",
    "--with": "with",
    "--expect-fail": "expectFail",
    "--test-name": "testName",
    "--expect-message": "expectMessage",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const key = flagToKey[flag];
    if (!key) {
      throw new UsageError(`無法識別的參數:${arg}`);
    }
    if (eq !== -1) {
      out[key] = arg.slice(eq + 1);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      throw new UsageError(`${flag} 後面缺少值。`);
    }
    out[key] = value;
    i++;
  }
  for (const required of ["file", "replace", "with", "expectFail"]) {
    if (out[required] === null) {
      throw new UsageError(`缺少必要參數 --${required.replace(/([A-Z])/g, "-$1").toLowerCase()}。`);
    }
  }
  return out;
}

function printEvidence(fields) {
  const lines = [
    "=== mutate.mjs evidence ===",
    `command: ${fields.command}`,
    `file mutated: ${fields.relFile}${fields.line != null ? ` (line ${fields.line})` : ""}`,
    `replace: ${JSON.stringify(fields.replace)}`,
    `with: ${JSON.stringify(fields.with)}`,
    `outcome: exit ${fields.exitCode} — ${fields.meaning}`,
  ];
  if (fields.failureMessage != null) {
    lines.push(`failure message (first line): ${firstLine(fields.failureMessage)}`);
  }
  if (fields.greenTestCount != null) {
    lines.push(`green test count (baseline): ${fields.greenTestCount}`);
  }
  lines.push(`sha256 before: ${fields.shaBefore}`);
  lines.push(`sha256 after restore: ${fields.shaAfter}`);
  console.log(lines.join("\n"));
}

/**
 * The whole flow. Returns a process exit code (0-5). Never throws for any
 * condition this module defines an exit code for — `UsageError` (exit 1)
 * and `RestoreMismatchError` (exit 3) are caught by `main()`, not by
 * callers of `run()`, so unit tests can also call `run()` directly and get
 * a plain number back.
 */
export async function run(argv) {
  // Signal handlers are installed for the lifetime of this call and torn
  // down afterwards (see `installSignalHandlers`'s doc comment for why
  // this happens here and not at module import time).
  const uninstallSignalHandlers = installSignalHandlers();
  try {
    return await runInner(argv);
  } finally {
    uninstallSignalHandlers();
  }
}

async function runInner(argv) {
  const args = parseArgs(argv);

  const repoRoot = findRepoRoot(process.cwd());
  const absFile = path.resolve(repoRoot, args.file);
  if (!existsSync(absFile) || !statSync(absFile).isFile()) {
    throw new UsageError(`--file 指定的檔案不存在:${args.file}`);
  }
  const relFile = path.relative(repoRoot, absFile);

  const absExpectFail = path.resolve(repoRoot, args.expectFail);
  if (!existsSync(absExpectFail) || !statSync(absExpectFail).isFile()) {
    throw new UsageError(`--expect-fail 指定的測試檔不存在:${args.expectFail}`);
  }
  const { pkgName } = findOwningPackage(absExpectFail, repoRoot);

  const origBytes = readFileSync(absFile);
  const origHash = sha256Hex(origBytes);
  const origText = origBytes.toString("utf8");

  // Pre-flight self-check (E04-S083) — BEFORE anything else touches
  // `absFile`, including the --replace occurrence check below. See module
  // docstring's PRE-FLIGHT SELF-CHECK: IN-FLIGHT MARKER section.
  checkNoStaleInFlightMarker(repoRoot, absFile, relFile, origHash);

  const occurrences = findOccurrences(origText, args.replace);
  if (occurrences.length !== 1) {
    const where = occurrences.map((o) => o.line).join(", ");
    throw new UsageError(
      occurrences.length === 0
        ? `在 ${relFile} 裡找不到 --replace 指定的字面字串:${JSON.stringify(args.replace)}`
        : `--replace 指定的字串在 ${relFile} 出現 ${occurrences.length} 次(必須恰好 1 次,不做全換):行號 ${where}`,
    );
  }
  const mutationLine = occurrences[0].line;
  const mutationOffset = occurrences[0].offset;

  // Step 3 — baseline FIRST, before anything is touched.
  const baseline = await runVitestJson({ repoRoot, pkgName, absTestFile: absExpectFail, testName: args.testName });
  if (!isValidGreenBaseline(baseline.report)) {
    throw new UsageError(
      `${args.expectFail} 在套用突變之前不是有效的綠色基準(必須 success 且 numPassedTests > 0,` +
        `"0 個測試通過" 不算基準)。實際:success=${baseline.report.success}, ` +
        `numPassedTests=${baseline.report.numPassedTests}, numFailedTests=${baseline.report.numFailedTests}。` +
        `command: ${baseline.commandLine}`,
    );
  }
  const greenTestCount = baseline.report.numPassedTests;

  // Step 4 — apply the mutation. The in-flight marker is written FIRST
  // (recording both the original and the about-to-be-written mutated
  // sha256, plus the original bytes for self-healing), then
  // `activeMutation` is set BEFORE the mutation write itself (not after)
  // so there is no window, however small, where the file has already been
  // mutated on disk but a signal handler wouldn't know to restore it.
  const mutatedText = applyMutationAt(origText, mutationOffset, args.replace, args.with);
  const mutatedHash = sha256Hex(Buffer.from(mutatedText, "utf8"));
  const markerPath = inFlightMarkerPathFor(repoRoot, relFile);
  writeInFlightMarker(markerPath, relFile, origBytes, origHash, mutatedHash);
  activeMutation = { absFile, origBytes, markerPath };
  writeFileSync(absFile, mutatedText, "utf8");

  const evidenceBase = {
    command: `pnpm --filter ${pkgName} exec vitest run ${args.expectFail}${
      args.testName ? ` -t ${JSON.stringify(args.testName)}` : ""
    } --reporter=json`,
    relFile,
    line: mutationLine,
    replace: args.replace,
    with: args.with,
    shaBefore: origHash,
    greenTestCount,
  };

  let exitCode;
  let failureMessage = null;
  let meaning;
  try {
    // Step 5/6 — run vitest directly (never through turbo) and classify.
    const mutated = await runVitestJson({ repoRoot, pkgName, absTestFile: absExpectFail, testName: args.testName });
    const classified = classifyVitestJsonReport(mutated.report);

    if (classified.outcome === "passed") {
      exitCode = 2;
      meaning = "突變後仍然是綠的——守門不響";
    } else if (classified.outcome === "collection_error") {
      exitCode = 4;
      meaning = "無法判定：紅了,但不是因為斷言失敗(collection / unhandled error)";
      failureMessage = classified.failureMessage;
    } else if (args.expectMessage != null && !classified.failureMessage.includes(args.expectMessage)) {
      exitCode = 5;
      meaning = "紅在錯的原因上——失敗訊息不包含 --expect-message 指定的字面";
      failureMessage = classified.failureMessage;
    } else {
      exitCode = 0;
      meaning = "守門正確觸發——突變前綠、突變後真的因斷言失敗變紅";
      failureMessage = classified.failureMessage;
    }
  } finally {
    // Step 7 — restore from the IN-MEMORY bytes. No git, always, no matter
    // what happened above (including an exception mid-classification).
    // Shared with the signal handler via `restoreActiveMutation` so the
    // two are mutually idempotent — see module docstring's SIGNAL SAFETY
    // section. Under normal (non-signal) operation this is simply the
    // restore, same as before.
    restoreActiveMutation();
  }

  const restoredBytes = readFileSync(absFile);
  const restoredHash = sha256Hex(restoredBytes);
  if (!verifyRestoredHash(restoredBytes, origHash)) {
    printEvidence({
      ...evidenceBase,
      exitCode: 3,
      meaning: "還原後 sha256 不一致(嚴重錯誤,理論上不應發生)",
      failureMessage,
      shaAfter: restoredHash,
    });
    return 3;
  }

  // Step 8 — re-run once more after restoring, to confirm green again. A
  // byte-identical restore that somehow still isn't green would mean the
  // baseline in step 3 was not reproducible (flaky test), not that this
  // tool's own restore is broken — bucketed under exit 1 (see module
  // docstring) rather than inventing a new code the interface doesn't define.
  const postRestore = await runVitestJson({ repoRoot, pkgName, absTestFile: absExpectFail, testName: args.testName });
  if (!isValidGreenBaseline(postRestore.report)) {
    printEvidence({
      ...evidenceBase,
      exitCode: 1,
      meaning: "還原後 hash 一致,但重跑不是綠的(測試本身不穩定,不是本工具的還原壞了)",
      failureMessage,
      shaAfter: restoredHash,
    });
    throw new UsageError(
      "還原後 sha256 一致,但重跑 --expect-fail 不是有效的綠色基準——這代表這個測試本身不穩定" +
        "(flaky),不能作為突變測試的目標,不是本工具的還原機制壞了。",
    );
  }

  printEvidence({ ...evidenceBase, exitCode, meaning, failureMessage, shaAfter: restoredHash });
  return exitCode;
}

async function main(argv) {
  try {
    return await run(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`[mutate.mjs] 錯誤(exit 1): ${err.message}`);
      return 1;
    }
    console.error(`[mutate.mjs] 未預期的例外:`, err);
    return 1;
  }
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
}
