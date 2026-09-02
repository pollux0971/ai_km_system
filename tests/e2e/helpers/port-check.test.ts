import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { assertPortsFreeForCIOnce, isPlaywrightWorkerProcess } from "./port-check";

/**
 * E01-S034. `specs/port-check.spec.ts` already unit-tests `assertPortsFreeForCI`
 * itself (unchanged by this story — see that function's own doc comment)
 * via real Playwright specs. This file is new and covers ONLY the new
 * surface this story adds: `isPlaywrightWorkerProcess()` and the
 * `assertPortsFreeForCIOnce()` composition that `playwright.config.ts`
 * now calls instead of `assertPortsFreeForCI` directly.
 *
 * Deliberately a vitest `helpers/**\/*.test.ts` file (picked up by
 * `test:unit`, per `vitest.config.ts`'s own doc comment), not a Playwright
 * spec — running this via `playwright test` would itself start webServers
 * and touch the shared `.e2e.lock`, which is exactly what this check runs
 * to avoid depending on. `TEST_WORKER_INDEX` is set/restored directly on
 * `process.env` (mirroring how `specs/port-check.spec.ts` already
 * mutates `process.env.CI`) to simulate "I am a real Playwright worker"
 * / "I am the real main process" without needing an actual Playwright run.
 */

function listenOnEphemeralPort(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("listenOnEphemeralPort: unexpected server.address()"));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("isPlaywrightWorkerProcess", () => {
  afterEach(() => {
    delete process.env.TEST_WORKER_INDEX;
  });

  it("is false when TEST_WORKER_INDEX is unset -- the real main/root process (the one that starts the webServers) never has this set", () => {
    delete process.env.TEST_WORKER_INDEX;
    expect(isPlaywrightWorkerProcess()).toBe(false);
  });

  it("is true when TEST_WORKER_INDEX is set -- what Playwright's own WorkerMain constructor sets, before that process ever loads the config", () => {
    process.env.TEST_WORKER_INDEX = "0";
    expect(isPlaywrightWorkerProcess()).toBe(true);
  });

  it("reads from an injected env object rather than process.env when one is passed, for tests that don't want to mutate global state", () => {
    expect(isPlaywrightWorkerProcess({})).toBe(false);
    expect(isPlaywrightWorkerProcess({ TEST_WORKER_INDEX: "3" })).toBe(true);
  });
});

describe("assertPortsFreeForCIOnce -- the exact guard playwright.config.ts calls", () => {
  afterEach(() => {
    delete process.env.TEST_WORKER_INDEX;
    delete process.env.CI;
  });

  it("E01-S034 fix: in a simulated WORKER process, does NOT throw even though the port is occupied and CI=true -- this is the exact scenario that made every e2e run fail (a worker re-evaluating the config after the main process already bound the port)", async () => {
    const { server, port } = await listenOnEphemeralPort();
    process.env.CI = "true";
    process.env.TEST_WORKER_INDEX = "1";
    try {
      expect(() => assertPortsFreeForCIOnce([port])).not.toThrow();
    } finally {
      await closeServer(server);
    }
  });

  it("in the real MAIN process (TEST_WORKER_INDEX unset), still throws naming the port when it is genuinely occupied and CI=true -- the E01-S030 hazard this story must NOT weaken", async () => {
    const { server, port } = await listenOnEphemeralPort();
    process.env.CI = "true";
    delete process.env.TEST_WORKER_INDEX;
    try {
      expect(() => assertPortsFreeForCIOnce([port])).toThrowError(new RegExp(`port ${port}`));
    } finally {
      await closeServer(server);
    }
  });

  it("in the real MAIN process, does not throw once the port is freed again", async () => {
    const { server, port } = await listenOnEphemeralPort();
    await closeServer(server);
    process.env.CI = "true";
    delete process.env.TEST_WORKER_INDEX;

    expect(() => assertPortsFreeForCIOnce([port])).not.toThrow();
  });
});
