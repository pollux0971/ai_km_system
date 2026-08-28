import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import {
  assertReusedServerEnvMatches,
  sentinelPath,
  wrapCommandWithSentinel,
} from "../helpers/env-sentinel";

/**
 * E04-S056 AC5.1. Unit-tests `helpers/env-sentinel.ts`'s pure logic directly
 * — same "spec file that isn't really a browser test" pattern
 * `port-check.spec.ts` already established for `helpers/port-check.ts`.
 *
 * Uses synthetic port numbers (59001+) that are never real listening ports —
 * the sentinel mechanism only ever keys a JSON blob by port NUMBER, so these
 * tests don't need (and must not use) the real 3000/3001, which some other
 * lane's own Playwright run may legitimately own right now via `.e2e.lock`.
 */

// `__dirname`, not `import.meta.url` — see helpers/env-sentinel.ts's own
// doc comment on `wrapCommandWithSentinel` for why (no "type": "module" in
// this package, so Playwright's config/test loader requires this file as
// CommonJS).
const HELPERS_DIR = path.join(__dirname, "..", "helpers");

test.describe("assertReusedServerEnvMatches", () => {
  const PORT = 59001;

  test.afterEach(() => {
    rmSync(sentinelPath(PORT), { force: true });
  });

  test("throws when no sentinel exists for the port (unknown env, must not silently reuse)", () => {
    rmSync(sentinelPath(PORT), { force: true });
    expect(() => assertReusedServerEnvMatches(PORT, { API_INTERNAL_URL: "http://127.0.0.1:4100" })).toThrowError(
      new RegExp(`port ${PORT}`),
    );
  });

  test("throws naming the mismatched variable when the sentinel disagrees with what this run expects", () => {
    execFileSync("node", [
      path.join(HELPERS_DIR, "write-env-sentinel.mjs"),
      String(PORT),
      "API_INTERNAL_URL",
    ], { env: { ...process.env, API_INTERNAL_URL: "http://127.0.0.1:4000" } });

    expect(() =>
      assertReusedServerEnvMatches(PORT, { API_INTERNAL_URL: "http://127.0.0.1:4100" }),
    ).toThrowError(/API_INTERNAL_URL/);
  });

  test("does not throw when the sentinel matches exactly", () => {
    execFileSync("node", [
      path.join(HELPERS_DIR, "write-env-sentinel.mjs"),
      String(PORT),
      "API_INTERNAL_URL",
      "NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE",
    ], {
      env: {
        ...process.env,
        API_INTERNAL_URL: "http://127.0.0.1:4100",
        NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE: "2",
      },
    });

    expect(() =>
      assertReusedServerEnvMatches(PORT, {
        API_INTERNAL_URL: "http://127.0.0.1:4100",
        NEXT_PUBLIC_CONVERSATIONS_PAGE_SIZE: "2",
      }),
    ).not.toThrow();
  });
});

test.describe("wrapCommandWithSentinel", () => {
  const PORT = 59002;

  test.afterEach(() => {
    rmSync(sentinelPath(PORT), { force: true });
  });

  test("the wrapped command writes a sentinel that reflects the env it actually ran with, before running the real command", () => {
    rmSync(sentinelPath(PORT), { force: true });
    const command = wrapCommandWithSentinel(PORT, ["API_INTERNAL_URL"], "node -e \"process.exit(0)\"");

    execFileSync("sh", ["-c", command], {
      env: { ...process.env, API_INTERNAL_URL: "http://127.0.0.1:4100" },
    });

    expect(() =>
      assertReusedServerEnvMatches(PORT, { API_INTERNAL_URL: "http://127.0.0.1:4100" }),
    ).not.toThrow();
  });
});
