/**
 * L2-EQ (E04-S073) — the live, real-app check.
 *
 * This is the ONE file that actually runs the comparison against the real
 * `apps/api` server: real `contracts/openapi/*.yaml`, every real domain
 * plugin (`identityPlugin`, `conversationPlugin`, `feedbackPlugin`,
 * `modelGatewayPlugin`), registered exactly the way `apps/api/src/main.ts`
 * registers them in production — nothing here is a fixture or a fake.
 *
 * HOW THIS OBSERVES EVERY ROUTE'S SCHEMA: see `collect-routes.ts`'s module
 * doc for why `buildServer()`'s own `testExtraPlugin` extension point is
 * too late (it registers after every domain plugin already has). This test
 * instead mocks the `fastify` package so `attachRouteCollector` runs the
 * instant `Fastify(...)` constructs the instance inside `server.ts` —
 * before `server.ts` registers a single plugin. `apps/api` itself is never
 * modified; only the module `server.ts` imports is wrapped, and the wrap
 * delegates every call to the real, unmodified `fastify` factory.
 *
 * HOW TO RUN THIS MANUALLY (this package deliberately has no
 * `package.json` "test" script — see README.md "Why this is not part of
 * any gate"):
 *
 *   pnpm --filter @ai-km/contract-equivalence exec vitest run src/check.live.test.ts
 *
 * TWO TESTS, TWO DIFFERENT JOBS:
 *
 *   1. "every registered route matches its contract" — the actual
 *      deliverable. Prints the FULL MATCH/DIVERGES/ABSENT report and then
 *      asserts zero DIVERGES. AS OF THIS STORY IT IS EXPECTED TO FAIL: two
 *      real, explained divergences exist (`GET /admin/metrics/latency`'s
 *      `days` default, `GET /admin/feedback`'s `page`/`pageSize` defaults —
 *      see PROGRESS.md's E04-S073 row and `normalize.ts`'s module doc for
 *      why these are real findings, not normalisation gaps). Leaving this
 *      test genuinely red is deliberate — per this story's landing
 *      constraints, DIVERGES must never be quietly made to pass, and
 *      wrapping it in `it.fails()` to force green would be exactly that.
 *      Nothing depends on this file being green (see README), so a real,
 *      visible red here costs nothing and hides nothing.
 *
 *   2. "reverse-verification target" — scoped to exactly ONE route
 *      (`POST .../revisions`, whose body is `messages.ts`'s
 *      `CREATE_REVISION_BODY_SCHEMA`, still hand-transcribed per
 *      E04-S050's own EVIDENCE) that MATCHES today. This is the test
 *      `tools/mutate.mjs --expect-fail` points at: it needs a genuinely
 *      GREEN baseline (mutate.mjs refuses to run against a red one), which
 *      test 1 cannot offer while real DIVERGES exist elsewhere in the app.
 *      On a mutated `CREATE_REVISION_BODY_SCHEMA`, this throws a plain
 *      `Error` whose message embeds the diff verbatim (not a bare
 *      `toEqual` mismatch) specifically so the mutated field's name is
 *      guaranteed to appear in the failure text mutate.mjs's
 *      `--expect-message` matches against.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { CollectedRoute } from "./collect-routes.js";
import { loadAllContracts, resolveContractsDir } from "./load-contracts.js";
import { buildReport, type BuildReportResult } from "./build-report.js";
import { printFullReport, divergedRoutes } from "./print-report.js";

const { collected } = vi.hoisted(() => ({ collected: [] as CollectedRoute[] }));

vi.mock("fastify", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fastify")>();
  const { attachRouteCollector } = await import("./collect-routes.js");
  const wrapped = ((options?: unknown) => {
    const instance = (actual.default as (opts?: unknown) => FastifyInstance)(options);
    attachRouteCollector(instance, collected);
    return instance;
  }) as typeof actual.default;
  return { ...actual, default: wrapped };
});

// Resolved AFTER the mock above so `server.ts`'s own `import Fastify from
// "fastify"` binds to the wrapped factory.
const { buildServer } = await import("../../../apps/api/src/server.js");
const { loadConfig } = await import("../../../apps/api/src/config.js");

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const REVISION_ROUTE_KEY = "POST /v1/conversations/:conversationId/messages/:messageId/revisions";

let app: FastifyInstance | undefined;
let result: BuildReportResult;

beforeAll(async () => {
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  // No `contractsDir` override: the real `contracts/openapi`, not a
  // fixture — L2-EQ is meaningless against a fixture spec no route was
  // ever written against.
  app = await buildServer({ config, dbPath: ":memory:" });
  expect(collected.length).toBeGreaterThan(0);

  const specs = await loadAllContracts(resolveContractsDir(repoRoot));
  result = buildReport(specs, collected);
  printFullReport(result);
});

afterAll(async () => {
  await app?.close();
});

describe("L2-EQ: runtime schema vs contract (E04-S073)", () => {
  it("every registered route's Fastify schema equals its contract operation's schema", () => {
    const diverged = divergedRoutes(result);
    // Vitest prints `diverged` as a structured diff against `[]` on
    // failure — every entry (route key, field, and per-field diff entries
    // naming the exact schema path that differs) lands in the assertion
    // failure output, not just a bare count. See this file's module doc
    // for why this specific test is expected to be red right now.
    expect(diverged).toEqual([]);
  });

  it("reverse-verification target: POST .../revisions body matches today (see tools/mutate.mjs run in PROGRESS.md's E04-S073 row)", () => {
    const route = result.routes.find((r) => r.key === REVISION_ROUTE_KEY);
    if (!route) {
      throw new Error(`no collected route matched ${REVISION_ROUTE_KEY} — route inventory changed?`);
    }
    const bodyField = route.requestFields.find((f) => f.field === "body");
    if (bodyField?.status !== "MATCH") {
      throw new Error(
        `expected ${REVISION_ROUTE_KEY}'s body field to be MATCH, got ${bodyField?.status}. ` +
          `Diff: ${JSON.stringify(bodyField?.diff)}`,
      );
    }
    expect(bodyField.status).toBe("MATCH");
  });
});
