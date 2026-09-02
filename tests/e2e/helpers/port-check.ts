import { execFileSync } from "node:child_process";

/**
 * E01-S030. `reuseExistingServer: true` (the local-dev default) silently
 * reuses whatever is already listening on a webServer's port — convenient
 * for iterating locally, but in CI a leftover process from an interrupted
 * previous run would make the NEW run silently test OLD code on a false
 * green. `resolveReuseExistingServer()` flips that default off in CI
 * (`playwright.config.ts` sets `reuseExistingServer: !process.env.CI` for
 * the `web`/`admin` webServer entries); `assertPortsFreeForCI()` is the
 * explicit, loud pre-flight check this story adds on top of that — instead
 * of letting the underlying `next dev` process fail with a possibly-cryptic
 * `EADDRINUSE`, it fails immediately with the offending port AND the
 * process holding it (via `ss`, the same tool this fleet's own `.e2e.lock`
 * scripts already use for the identical purpose).
 */

export function resolveReuseExistingServer(): boolean {
  return !process.env.CI;
}

export interface OccupiedPort {
  port: number;
  listing: string;
}

/**
 * Synchronous by design: this is meant to run at `playwright.config.ts`
 * module-evaluation time (before `defineConfig()`'s `webServer` array is
 * even built), the same place `ensureFakeMicrophoneWav()` already runs
 * synchronously — see that helper's own doc comment for why `globalSetup`
 * runs too late for this kind of pre-flight check.
 */
export function findOccupiedPorts(ports: number[]): OccupiedPort[] {
  let listing: string;
  try {
    listing = execFileSync("ss", ["-ltnp"], { encoding: "utf8" });
  } catch {
    // `ss` missing or failed — can't prove anything is occupied, so don't
    // block startup on an inconclusive check. Real occupation still gets
    // caught by the underlying dev server's own EADDRINUSE failure.
    return [];
  }

  const occupied: OccupiedPort[] = [];
  for (const port of ports) {
    const portListing = listing
      .split("\n")
      .filter((line) => new RegExp(`[:.]${port}\\s`).test(line));
    if (portListing.length > 0) {
      occupied.push({ port, listing: portListing.join("\n") });
    }
  }
  return occupied;
}

/**
 * Throws with an explicit, actionable message (port + occupying process)
 * instead of allowing CI to silently start testing against a stale server.
 * No-op when not in CI — local dev keeps `reuseExistingServer: true` and
 * relies on that, not this check.
 *
 * Deliberately unaware of Playwright's process topology (main vs. worker)
 * — that is a SEPARATE concern, added by E01-S034 as `isPlaywrightWorkerProcess()`
 * / `assertPortsFreeForCIOnce()` below rather than fused into this function,
 * so this function's existing behaviour (and the tests in
 * `specs/port-check.spec.ts` that pin it) stays exactly as it was.
 */
export function assertPortsFreeForCI(ports: number[]): void {
  if (!process.env.CI) return;

  const occupied = findOccupiedPorts(ports);
  if (occupied.length === 0) return;

  const detail = occupied.map((o) => `  port ${o.port}:\n${o.listing}`).join("\n\n");
  throw new Error(
    `[E01-S030] CI requires webServer ports to be free before Playwright starts them, ` +
      `but found existing listener(s):\n\n${detail}\n\n` +
      `A leftover process from a previous run would otherwise be silently reused, ` +
      `testing old code under a false green. Kill the offending process(es) and retry.`,
  );
}

/**
 * E01-S034. `assertPortsFreeForCI` above is correct in isolation but was
 * being called at `playwright.config.ts` module scope, and Playwright
 * re-evaluates that module in EVERY worker process, not once — see
 * ROADMAP_TEMP.md §5-pi's third補記 for the full incident (CI's `workers: 2`
 * meant the main process started the `web`/`admin` webServers on
 * 3000/3001, then each of the 2 workers re-imported the config, saw the
 * ports the main process had just bound, and threw — 268 failed / 63 did
 * not run out of 331, the same error printed 534 times).
 *
 * The fix is not to weaken the check (the hazard — a foreign leftover
 * process on 3000/3001 silently reused via `reuseExistingServer` — is
 * real) but to run it only in the process that is about to start those
 * webServers, i.e. NOT in a worker.
 *
 * Detection: `TEST_WORKER_INDEX`. This is not a heuristic we invented —
 * it is Playwright's own public, documented env var (see
 * `playwright/test.d.ts`: "Also available as `process.env.TEST_WORKER_INDEX`",
 * and confirmed by reading `playwright-core`'s `WorkerMain` constructor,
 * which sets it, synchronously, in the worker's own process object BEFORE
 * that worker process ever loads the config file). The root process that
 * builds the `webServer` array and starts them never has this variable
 * set in its own environment — only a process Playwright itself spawned
 * to run tests does.
 *
 * What breaks if this detection is ever wrong, in either direction:
 *  - A real worker process where `TEST_WORKER_INDEX` were (wrongly) unset
 *    would re-run the check against the main process's own just-started
 *    servers and throw — this is the EXACT loud, already-observed failure
 *    this story fixes (534x the same message). Loud, not silent.
 *  - The real main process where `TEST_WORKER_INDEX` were (wrongly) set
 *    would skip the check entirely — a silent regression back to the
 *    pre-E01-S030 hazard (a foreign leftover process on 3000/3001 gets
 *    reused instead of failing loudly). This is the direction that
 *    matters, and it is exactly what `port-check.test.ts`'s reverse
 *    verification proves does NOT happen for the real main process (no
 *    override needed — the real env var is simply absent there).
 * Both directions are observable from a single CI run (the job either
 * still throws 534 times, or it doesn't and the webServers start) —
 * neither degrades into "written, reviewed, merged, never executed",
 * which is what happened to `assertPortsFreeForCI` itself.
 *
 * `globalSetup` was considered and rejected: this repo's own
 * `global-setup.ts` documents (and relies on) running AFTER Playwright's
 * webServer readiness check, i.e. after the ports this check inspects are
 * already bound by Playwright's own servers — exactly the timing this
 * check exists to run BEFORE. Module-scope evaluation, gated on process
 * identity, is the only place early enough.
 */
export function isPlaywrightWorkerProcess(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TEST_WORKER_INDEX !== undefined;
}

/**
 * The exact guard `playwright.config.ts` calls at module scope — extracted
 * here (rather than inlined in the config file) so the composition itself
 * is unit-testable without needing a real `playwright test` invocation
 * (which would start webServers and touch the shared `.e2e.lock`).
 */
export function assertPortsFreeForCIOnce(ports: number[]): void {
  if (isPlaywrightWorkerProcess()) return;
  assertPortsFreeForCI(ports);
}
