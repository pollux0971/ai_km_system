import { randomUUID } from "node:crypto";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { ensureFakeMicrophoneWav } from "./helpers/fake-microphone";
import { assertNotBlockingLockHolderOnce } from "./helpers/lock-guard";
import { assertPortsFreeForCIOnce, resolveReuseExistingServer } from "./helpers/port-check";
import { wrapCommandWithSentinel } from "./helpers/env-sentinel";
import { API_BASE_URL, API_PORT, ADMIN_EXPECTED_ENV, WEB_EXPECTED_ENV } from "./helpers/webserver-env";
import { STORAGE_STATE_PATH } from "./auth-storage-state";

/**
 * E11-S001 adds apps/admin as a second, independently-deployed app
 * (:3001) alongside apps/web (:3000) — its own webServer entry + its own
 * `admin` project (baseURL swapped, specs matched by an `admin-` file
 * prefix) so admin specs run against the right server without every
 * existing (and future) apps/web spec needing to know admin exists at
 * all. `web`'s own testIgnore is the mirror image of `admin`'s
 * testMatch, so a spec always belongs to exactly one project, never both
 * or neither. Both patterns intentionally aren't `^`-anchored — testMatch/
 * testIgnore match against each file's full absolute path, not its
 * basename, so an anchored pattern would never match a real file here.
 *
 * E03-S038 adds a THIRD webServer: apps/api, with its own throwaway
 * SQLite file per Playwright run (AI_KM_DB_PATH below) and the E2E-only
 * env flags (test sandbox, dev triggers, demo-user seeding, fake ASR
 * provider) documented in README.md. Every browser context that logs in
 * gets its own isolated sandbox owner (AI_KM_TEST_SANDBOX=true,
 * services/identity's `runSandboxSeeders`), replacing the old
 * "everything is one shared client-side mock" model with real isolation
 * backed by a real (if throwaway) server — see `specs/api-sandbox.spec.ts`
 * for the test proving that isolation actually holds. `web`'s own env
 * gets `API_INTERNAL_URL` so its `/api/v1/*` rewrite (next.config.ts)
 * reaches this run's own apps/api instance.
 *
 * **Deliberately NOT port 4000.** A shared, manually-run apps/api instance
 * (maintained by the fleet coordinator for other lanes' own verification)
 * commonly occupies :4000 during development — with `reuseExistingServer`,
 * Playwright would silently reuse THAT instance instead of starting its
 * own, quietly defeating every isolation property this story exists to
 * provide (own tmp SQLite, own test-sandbox/fake-ASR env) and reintroducing
 * exactly the cross-run data pollution this story is meant to eliminate.
 * Running on its own port (4100) sidesteps the conflict entirely — this
 * webServer entry is brand new, so `reuseExistingServer: false` below is
 * also safe to set now rather than waiting on E01-S030 (which only needs
 * to change this for the pre-existing web/admin entries): a occupied :4100
 * fails loudly instead of silently reusing whatever happens to be there.
 */

// E04-S057: runs before ANYTHING else in this file — every entry point
// (bare `playwright test`, `--list`, `--last-failed`, a turbo-triggered
// run) evaluates this module first, so a single synchronous check here
// covers all of them. Refuses to proceed if the shared `.e2e.lock` is
// held by someone else (see helpers/lock-guard.ts for the full
// reasoning and the incident this fixes). No-op when nobody holds the
// lock, and never blocks the lock holder's own run (see e2e-locked.sh).
//
// E01-S036: like the port guard two lines below, this module is
// re-evaluated once per Playwright WORKER process too, not just once by
// the process that actually needs the check — `flock -n` acquires and
// releases immediately, so two sibling workers evaluating this module at
// overlapping instants can make one misread the other's momentary hold as
// "someone else holds the shared lock" (observed on CI run
// `33658608842`, intermittent — the very next run of identical code was
// green). Calling `assertNotBlockingLockHolderOnce` instead of
// `assertNotBlockingLockHolder` directly keeps the guard itself unchanged
// and skips it in worker processes — see that function's own doc comment
// in helpers/lock-guard.ts for exactly how "am I a worker" is detected and
// what happens if that detection is ever wrong in each direction.
assertNotBlockingLockHolderOnce();

// Unique per Playwright invocation (not per test/worker) — every worker
// process spawned by this run shares the same apps/api server and its one
// SQLite file; a per-worker path would just mean N empty, disconnected
// databases instead of one shared sandboxed one.
const RUN_ID = randomUUID();
const E2E_DB_PATH = path.join(tmpdir(), `ai-km-e2e-${RUN_ID}.sqlite`);

// Generated once, synchronously, before defineConfig() below builds the
// static config object — see fake-microphone.ts's own doc comment for why
// this can't be done via Playwright's `globalSetup` hook instead (that runs
// too late to reach `use.launchOptions.args`).
const FAKE_MIC_WAV = ensureFakeMicrophoneWav();

// E01-S030: also synchronous and also before defineConfig() — a CI run
// with a leftover process still on 3000/3001 (e.g. an interrupted previous
// run) must fail loudly right here, before Playwright even attempts to
// start `web`/`admin`'s webServer, not silently test old code under a
// false green. See helpers/port-check.ts's own doc comment. No-op outside
// CI (local dev keeps `reuseExistingServer: true` below and relies on
// that, not this check).
//
// E01-S034: this module is re-evaluated once per Playwright WORKER
// process too, not just once by the process that starts the webServers
// (CI's `workers: 2` means the check above used to run three times per
// run: once correctly, before anything is listening, and twice more
// AFTER the main process had already bound 3000/3001 itself — each
// worker then saw those ports "occupied" and threw, 534 times, making
// every e2e run in CI fail before a single test executed). Calling
// `assertPortsFreeForCIOnce` instead of `assertPortsFreeForCI` directly
// keeps the check itself unchanged and skips it in worker processes —
// see that function's own doc comment in helpers/port-check.ts for
// exactly how "am I a worker" is detected and what happens if that
// detection is ever wrong.
assertPortsFreeForCIOnce([3000, 3001]);

export default defineConfig({
  testDir: "./specs",
  // Warms up /login on both apps after webServer readiness but before any
  // spec runs — see global-setup.ts's own doc comment (E01-S027 root-cause
  // finding: Next.js dev-mode on-demand compilation, not "flaky tests").
  globalSetup: "./global-setup.ts",
  fullyParallel: true,
  // E01-S027: measured via `--repeat-each=3` on the full suite across
  // multiple rounds (archive/stories/E01-S027.md's EVIDENCE has the full
  // breakdown) — Round 0 (unmodified config, baseline): 813 test instances,
  // only 2 flaky failures, both `page.waitForURL` timeouts under full-suite
  // load, not a webServer-readiness or cold-compile symptom (those are
  // already handled by globalSetup above). That signature matches CPU
  // saturation, not insufficient timeouts.
  //
  // Round 1 tried this `cpus/2` (4 on this 8-core box) — barely changed
  // actual concurrency (close to Playwright's own implicit local default),
  // so the same 2 tests stayed flaky. Round 2 tried a firm `cpus/4` cap (2
  // workers) — this DID eliminate both flaky failures (0/3 across a full
  // repeat-each=3 run), confirming the CPU-saturation diagnosis, but cost
  // 29.0m vs the 19.5m baseline (1.49x) — that measurement itself may be
  // contention-inflated (see below), so this ratio needs a quiet-machine
  // re-check before being treated as a real time/stability tradeoff.
  //
  // Settled fix: keep `workers` at the faster `cpus/2` (Round 1's time
  // profile), and instead give only the 2 affected tests themselves a
  // wider timeout budget via `test.slow()` (see knowledge-ui-e2e.spec.ts
  // and admin-analytics-e2e.spec.ts) — a per-test fix for a per-test
  // symptom, without taxing the other 811 instances' runtime. Round 3
  // (this combination) measured 55 failed under a confirmed external load
  // spike (`uptime` load average 25+ on this 8-core box) from a completely
  // different project's own parallel worktrees (`na-wt/*`, unrelated to
  // this fleet) — outside `.e2e.lock`'s port-only scope and outside this
  // repo's control. Per ai-km-e4's ruling (2026-08-29): AC1's "N→0" must
  // be measured under quiet-machine conditions with load average recorded
  // in EVIDENCE, not loosened — a clean re-run once machine load is normal
  // is still pending (see archive/stories/E01-S027.md's EVIDENCE).
  workers: process.env.CI ? 2 : Math.max(1, Math.floor(cpus().length / 2)),
  webServer: [
    {
      // E04-S056 AC5.1: `reuseExistingServer` below silently keeps whatever
      // env the ALREADY-LISTENING process was started with — Playwright's
      // own `env:` here only ever applies when it starts a fresh process.
      // `wrapCommandWithSentinel` makes every real start of this command
      // record the env it actually got, so `global-setup.ts` can catch a
      // reused server whose recorded env no longer matches `WEB_EXPECTED_ENV`
      // below (see helpers/env-sentinel.ts's own doc comment).
      command: wrapCommandWithSentinel(3000, Object.keys(WEB_EXPECTED_ENV), "pnpm --filter @ai-km/web dev"),
      url: "http://localhost:3000",
      // E01-S030: `!process.env.CI` — local dev keeps the old `true`
      // (convenient: don't restart on every run); CI always starts fresh,
      // backed by the loud pre-flight check above instead of silently
      // adopting a leftover process. See helpers/port-check.ts.
      reuseExistingServer: resolveReuseExistingServer(),
      timeout: 120000,
      // E03-S046 / E03-S045: see WEB_EXPECTED_ENV's own doc comment in
      // helpers/webserver-env.ts for why each of these three must be exactly
      // these values in E2E — kept there, not duplicated here, so the values
      // Playwright actually sets and the values global-setup.ts verifies
      // against a reused server can never quietly drift apart.
      env: WEB_EXPECTED_ENV,
    },
    {
      // E04-S056 AC5.1: see the `web` entry above — same hazard, same fix.
      command: wrapCommandWithSentinel(3001, Object.keys(ADMIN_EXPECTED_ENV), "pnpm --filter @ai-km/admin dev -p 3001"),
      url: "http://localhost:3001",
      // E01-S030: see the `web` entry above — same reasoning.
      reuseExistingServer: resolveReuseExistingServer(),
      timeout: 120000,
      env: ADMIN_EXPECTED_ENV,
    },
    {
      command: "pnpm --filter @ai-km/api dev",
      url: `${API_BASE_URL}/v1/health`,
      // Deliberately false, not true — see this file's own top-of-file
      // doc comment: this webServer entry is new, its whole purpose is
      // isolation, and it runs on a port nothing else is expected to
      // occupy, so reuse would only ever mean "something unexpected is
      // on 4100" — that should fail loudly, not be silently adopted.
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        AI_KM_API_PORT: String(API_PORT),
        AI_KM_DB_PATH: E2E_DB_PATH,
        AI_KM_TEST_SANDBOX: "true",
        AI_KM_DEV_TRIGGERS: "true",
        AI_KM_SEED_DEMO_USERS: "true",
        AI_KM_ASR_PROVIDER: "fake",
        AI_KM_LOG_LEVEL: "warn",
      },
    },
  ],
  projects: [
    {
      name: "web",
      testIgnore: /admin-.*\.spec\.ts$/,
      use: {
        baseURL: "http://localhost:3000",
        permissions: ["microphone"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            `--use-file-for-fake-audio-capture=${FAKE_MIC_WAV}%noloop`,
          ],
        },
      },
    },
    {
      // E11-S026: logs into apps/admin once as demo-super and saves the
      // resulting session cookie — see auth.setup.ts's own doc comment.
      // Not matched by `admin`'s own testMatch (that pattern requires an
      // `admin-` FILE prefix; this file is named `auth.setup.ts`), so it
      // needs its own explicit testMatch here.
      name: "setup",
      // Overrides the top-level `testDir: "./specs"` — auth.setup.ts lives
      // directly under tests/e2e/, not tests/e2e/specs/ (spec's own
      // Development Boundaries name that exact path).
      testDir: "./",
      testMatch: /auth\.setup\.ts$/,
      use: { baseURL: "http://localhost:3001" },
    },
    {
      name: "admin",
      testMatch: /admin-.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { baseURL: "http://localhost:3001", storageState: STORAGE_STATE_PATH },
    },
  ],
});
