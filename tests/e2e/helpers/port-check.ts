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
