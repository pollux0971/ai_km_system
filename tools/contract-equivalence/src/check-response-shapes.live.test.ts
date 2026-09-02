/**
 * E04-S079 — does what a route ACTUALLY returns match what the contract
 * promises for a 2xx response?
 *
 * `check.live.test.ts` (E04-S073) already established that zero routes in
 * this app register a Fastify `response:` schema, so there is nothing
 * declarative on the runtime side for `build-report.ts`'s `response:<status>`
 * field to diff against — it can only ever read ABSENT, which is why it is
 * deliberately excluded from a route's MATCH/DIVERGES verdict (see
 * `build-report.ts`'s `RouteReport.responseFields` doc).
 *
 * THE METHOD CHOSEN HERE, AND WHY: exercise every reachable 2xx route
 * through the REAL, unmodified `apps/api` server (`buildServer()` — the same
 * function `check.live.test.ts` and `apps/api/src/full-chain-session.test.ts`
 * build against, with a REAL login through `identityPlugin`, a real session
 * cookie, and `enableTestAuthProvider: false` — the `x-test-user` bypass is
 * OFF, matching production), capture the REAL JSON body Fastify actually
 * serialised, and diff that INSTANCE against the contract's declared 2xx
 * schema with `response-instance-diff.ts`.
 *
 * The alternative this story's own instructions named — deriving the
 * "actual shape" from a handler's TypeScript return type instead of running
 * anything — was rejected: a return type only says what the AUTHOR believes
 * the function returns, not what actually crosses the wire. It cannot see a
 * `JSON.stringify` that silently drops an `undefined` property, a getter
 * that throws, a class instance whose enumerable own keys differ from its
 * declared interface, or (this repo's own repositories do this constantly,
 * on purpose — see `messages.repository.ts`'s `toMessage`) a conditional
 * spread that adds a key only when a value is non-null. Every one of those
 * is exactly the kind of drift a response-shape assessment exists to catch,
 * and a type-level read would have to re-simulate serialisation to see any
 * of them — at which point it is not reading types any more, it is running
 * the code, just badly. Running the real server through a real request is
 * the more direct way to get the same ground truth.
 *
 * WHAT THIS CANNOT SEE (stated, not hidden):
 *
 *   1. ONE 2xx SHAPE PER ROUTE, not every shape a route can produce. Each
 *      route below is exercised with exactly one representative "happy
 *      path" scenario (one input combination chosen to produce a normal,
 *      populated 2xx). A route whose 2xx shape VARIES by branch (e.g.
 *      `Message`'s optional `state`/`feedback`/`revisions`/`citationFeedback`
 *      fields are only present once something has set them — this suite's
 *      own scenario sequence deliberately drives several of those on before
 *      reading the message back, but not all combinations, and no route
 *      here is exercised on an empty/error/edge-case branch) is only
 *      checked on the one branch this suite drives it through.
 *   2. FIELD PRESENCE, not types/formats/enums — see
 *      `response-instance-diff.ts`'s module doc for the full list of what
 *      that comparison does and does not check.
 *   3. FOUR ROUTES ARE NOT EXERCISED AT ALL, each for a stated reason:
 *        - `DELETE /v1/conversations/:conversationId` and
 *          `POST /v1/auth/logout` both reply 204 with no body — there is no
 *          JSON instance to diff, not a gap in this tool.
 *        - `GET /v1/conversations/events` is Server-Sent Events, not a
 *          single JSON 2xx body — also not this tool's shape of question.
 *        - `GET /v1/health` has no matching yaml operation in any contract
 *          at all (E04-S078's own finding) — there is no contract 2xx
 *          schema to diff its body against.
 *   4. `POST /v1/transcriptions` IS a JSON 2xx route this tool could in
 *      principle exercise, and deliberately is NOT: reaching a 200 needs a
 *      valid 16kHz/mono/PCM16 WAV buffer, a multipart/form-data encoding of
 *      it, and `AI_KM_ASR_PROVIDER=fake` set before `buildServer()` runs.
 *      `services/model-gateway/src/testing/wav-fixture.ts` +
 *      `multipart-fixture.ts` already build exactly that fixture, and
 *      `services/model-gateway/src/routes/transcriptions.test.ts`'s own
 *      "AC1: valid 16k mono PCM16 WAV + fake provider -> 200" test already
 *      calls `expectResponseMatchesContract` (ajv, against the same
 *      `Transcription` schema this tool would diff against) on the real
 *      response body and is green today. Re-deriving an equivalent WAV/
 *      multipart fixture inside this Team A tool to ask the same question a
 *      second time was judged not worth the added fixture-construction
 *      surface for one more data point an existing, currently-passing test
 *      already answers — reading `services/model-gateway/src/routes/
 *      transcriptions.ts`'s handler (this story's own investigation did)
 *      shows it returns exactly the 7 contract-required fields and nothing
 *      else, matching that test's assertions.
 *
 * `contracts/openapi/*.yaml` is loaded independently (`load-contracts.ts`),
 * exactly like `check.live.test.ts` — the real files, never a fixture.
 *
 * E04-S073 FOLLOW-UP (2026-09-03, "gate-response-shape"): this file's own
 * two `it`s are now wired into `contract-gate` (see
 * `contracts/openapi/__checks__/run-gate.mjs`'s "response-shape (gated)"
 * section) — this is the HALF of `@ai-km/contract-equivalence` the user's
 * advisor ruled clear to gate, because its 2026-09-02 result was zero
 * unresolved findings (22/22 exercised routes clean). `check.live.test.ts`
 * (the route-schema comparison, with two real, still-undecided querystring
 * `default` DIVERGES) stays observed-only — see that file's own doc and
 * README.md "Two sections, two different exit-code relationships" for why
 * the ruling treats these as two separately-gateable checks, not one
 * package. This file's `beforeAll` also now prints a three-number coverage
 * report (declared / exercised / not-covered, by name) — see
 * `response-shape-coverage.ts` for why a flattering "N of N" fraction is
 * not good enough on its own.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { loadAllContracts, resolveContractsDir } from "./load-contracts.js";
import { buildYamlIndex, responseJsonSchema, type YamlOperation } from "./yaml-index.js";
import { routeKeyOf, routeKeyToString } from "./path-match.js";
import { diffResponseInstance, type InstanceDiffResult } from "./response-instance-diff.js";
import { computeResponseShapeCoverage } from "./response-shape-coverage.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// E04-S048 requires this on every state-changing request (see
// `apps/api/src/full-chain-session.test.ts`'s own identical header — copied
// from there, not invented here).
const CSRF_HEADER = { "x-requested-with": "XMLHttpRequest" };

interface Captured {
  /** Fastify-style URL template, e.g. "/v1/conversations/:conversationId" — matched to a yaml operation via `routeKeyOf`, same as `build-report.ts`. */
  readonly routeTemplate: string;
  readonly method: string;
  readonly status: number;
  readonly body: unknown;
}

export interface RouteShapeFinding {
  readonly key: string; // "METHOD /path" (OpenAPI-style, /v1 stripped — matches build-report.ts's convention)
  readonly status: number;
  readonly operationId?: string;
  readonly diff: InstanceDiffResult;
}

let app: FastifyInstance | undefined;
const captured: Captured[] = [];
let findings: RouteShapeFinding[] = [];

function extractSessionCookie(setCookieHeader: string | string[] | undefined): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  const match = /ai_km_session=[^;]+/.exec(raw ?? "");
  if (!match) throw new Error(`no ai_km_session cookie in Set-Cookie: ${JSON.stringify(setCookieHeader)}`);
  return match[0];
}

beforeAll(async () => {
  // Read by `services/identity/src/config.ts`'s `loadIdentityConfig()`
  // directly from `process.env` — same mechanism
  // `full-chain-session.test.ts` relies on (see that file's own comment).
  process.env.AI_KM_SEED_DEMO_USERS = "true";

  const { buildServer } = await import("../../../apps/api/src/server.js");
  const { loadConfig } = await import("../../../apps/api/src/config.js");
  const config = loadConfig({ NODE_ENV: "test", AI_KM_LOG_LEVEL: "silent" });
  // enableTestAuthProvider: false — the "x-test-user" bypass is OFF, the
  // production-equivalent setting. A real login, a real cookie, real
  // `requireSession` — nothing about the auth path is faked.
  app = await buildServer({ config, dbPath: ":memory:", enableTestAuthProvider: false });

  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { ...CSRF_HEADER },
    // demo-super carries every role this suite needs (super_administrator
    // qualifies for both admin-metrics's and admin-feedback's role gates —
    // see `services/feedback/src/routes/admin-metrics.ts`/`admin-feedback.ts`).
    payload: { username: "demo-super", password: "demo-pass-123" },
  });
  if (login.statusCode !== 200) {
    throw new Error(`demo login failed: ${login.statusCode} ${login.body}`);
  }
  captured.push({ routeTemplate: "/v1/auth/login", method: "POST", status: login.statusCode, body: login.json() });
  const cookie = extractSessionCookie(login.headers["set-cookie"]);
  const authed = (extra: Record<string, string> = {}): Record<string, string> => ({
    cookie,
    ...CSRF_HEADER,
    ...extra,
  });

  const session = await app.inject({ method: "GET", url: "/v1/auth/session", headers: authed() });
  captured.push({ routeTemplate: "/v1/auth/session", method: "GET", status: session.statusCode, body: session.json() });

  // ── conversations ──────────────────────────────────────────────────────
  const createConv = await app.inject({ method: "POST", url: "/v1/conversations", headers: authed() });
  captured.push({
    routeTemplate: "/v1/conversations",
    method: "POST",
    status: createConv.statusCode,
    body: createConv.json(),
  });
  const conversationId = createConv.json().id as string;

  const listConv = await app.inject({ method: "GET", url: "/v1/conversations", headers: authed() });
  captured.push({ routeTemplate: "/v1/conversations", method: "GET", status: listConv.statusCode, body: listConv.json() });

  const getConv = await app.inject({
    method: "GET",
    url: `/v1/conversations/${conversationId}`,
    headers: authed(),
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId",
    method: "GET",
    status: getConv.statusCode,
    body: getConv.json(),
  });

  const patchConv = await app.inject({
    method: "PATCH",
    url: `/v1/conversations/${conversationId}`,
    headers: authed(),
    payload: { title: "E04-S079 response-shape probe" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId",
    method: "PATCH",
    status: patchConv.statusCode,
    body: patchConv.json(),
  });

  // ── messages ────────────────────────────────────────────────────────────
  const createMsg = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: authed(),
    payload: { role: "assistant", content: "回答內容 [1]", state: "ANSWERED" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages",
    method: "POST",
    status: createMsg.statusCode,
    body: createMsg.json(),
  });
  const messageId = createMsg.json().id as string;

  const listMsg = await app.inject({
    method: "GET",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: authed(),
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages",
    method: "GET",
    status: listMsg.statusCode,
    body: listMsg.json(),
  });

  const revision = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages/${messageId}/revisions`,
    headers: authed(),
    payload: { content: "修訂後的回答內容 [1]", state: "ANSWERED" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages/:messageId/revisions",
    method: "POST",
    status: revision.statusCode,
    body: revision.json(),
  });

  // Feedback chain: verdict must be NG before /reason accepts a reason, and
  // a verdict must exist before /comment accepts a comment — same order
  // `full-chain-session.test.ts` already established works end-to-end.
  const feedback = await app.inject({
    method: "PUT",
    url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
    headers: authed(),
    payload: { verdict: "NG" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages/:messageId/feedback",
    method: "PUT",
    status: feedback.statusCode,
    body: feedback.json(),
  });

  const reason = await app.inject({
    method: "PUT",
    url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
    headers: authed(),
    payload: { reason: "INCOMPLETE" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages/:messageId/feedback/reason",
    method: "PUT",
    status: reason.statusCode,
    body: reason.json(),
  });

  const comment = await app.inject({
    method: "PUT",
    url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
    headers: authed(),
    payload: { comment: "評語內容" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages/:messageId/feedback/comment",
    method: "PUT",
    status: comment.statusCode,
    body: comment.json(),
  });

  const citation = await app.inject({
    method: "PUT",
    url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
    headers: authed(),
    payload: { verdict: "OK" },
  });
  captured.push({
    routeTemplate: "/v1/conversations/:conversationId/messages/:messageId/citations/:citationId/feedback",
    method: "PUT",
    status: citation.statusCode,
    body: citation.json(),
  });

  // ── usage-events / admin metrics / admin feedback (E13-S019) ───────────
  const usageEvent = await app.inject({
    method: "POST",
    url: "/v1/usage-events",
    headers: authed(),
    payload: { name: "conversation_created", conversationId, occurredAt: new Date().toISOString() },
  });
  captured.push({ routeTemplate: "/v1/usage-events", method: "POST", status: usageEvent.statusCode, body: usageEvent.json() });

  const today = new Date().toISOString().slice(0, 10);
  const usageMetrics = await app.inject({
    method: "GET",
    url: `/v1/admin/metrics/usage?date=${today}`,
    headers: authed(),
  });
  captured.push({
    routeTemplate: "/v1/admin/metrics/usage",
    method: "GET",
    status: usageMetrics.statusCode,
    body: usageMetrics.json(),
  });

  const latencyMetrics = await app.inject({ method: "GET", url: "/v1/admin/metrics/latency", headers: authed() });
  captured.push({
    routeTemplate: "/v1/admin/metrics/latency",
    method: "GET",
    status: latencyMetrics.statusCode,
    body: latencyMetrics.json(),
  });

  const adminFeedbackList = await app.inject({ method: "GET", url: "/v1/admin/feedback", headers: authed() });
  captured.push({
    routeTemplate: "/v1/admin/feedback",
    method: "GET",
    status: adminFeedbackList.statusCode,
    body: adminFeedbackList.json(),
  });

  const adminFeedbackOne = await app.inject({
    method: "GET",
    url: `/v1/admin/feedback/${messageId}`,
    headers: authed(),
  });
  captured.push({
    routeTemplate: "/v1/admin/feedback/:messageId",
    method: "GET",
    status: adminFeedbackOne.statusCode,
    body: adminFeedbackOne.json(),
  });

  // ── model gateway (embeddings/generation — deterministic/canned providers, E12-S032/S033) ──
  const embeddings = await app.inject({
    method: "POST",
    url: "/v1/embeddings",
    headers: authed(),
    payload: { input: ["保固期從出貨日起算 12 個月。"] },
  });
  captured.push({ routeTemplate: "/v1/embeddings", method: "POST", status: embeddings.statusCode, body: embeddings.json() });

  const generate = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: authed(),
    payload: {
      question: "保固期多久？",
      context: [
        {
          chunkId: "chunk-1",
          documentId: "doc-1",
          text: "保固期從出貨日起算 12 個月。",
          startOffset: 0,
          endOffset: 12,
        },
      ],
    },
  });
  captured.push({ routeTemplate: "/v1/generate", method: "POST", status: generate.statusCode, body: generate.json() });

  // ── health ──────────────────────────────────────────────────────────────
  const adminHealth = await app.inject({ method: "GET", url: "/v1/admin/health", headers: authed() });
  captured.push({ routeTemplate: "/v1/admin/health", method: "GET", status: adminHealth.statusCode, body: adminHealth.json() });

  // Every captured call must actually have reached its handler (2xx) — a
  // non-2xx here means the SCENARIO is broken (bad fixture data, wrong auth,
  // wrong preconditions), not a response-shape finding, and would otherwise
  // silently produce a diff against the wrong contract status or against
  // an error body instead of the intended 2xx one.
  for (const c of captured) {
    if (c.status < 200 || c.status >= 300) {
      throw new Error(
        `fixture scenario for ${c.method} ${c.routeTemplate} did not reach a 2xx (got ${c.status}): ${JSON.stringify(c.body)}`,
      );
    }
  }

  const specs = await loadAllContracts(resolveContractsDir(repoRoot));
  const yamlIndex = buildYamlIndex(specs);
  findings = captured.map((c) => {
    const key = routeKeyOf(c.routeTemplate, c.method);
    const keyString = routeKeyToString(key);
    const operation: YamlOperation | undefined = yamlIndex.get(keyString);
    if (!operation) {
      throw new Error(`no yaml operation matched ${keyString} — route inventory changed since this suite was written?`);
    }
    const schema = responseJsonSchema(operation, String(c.status));
    if (schema === undefined) {
      throw new Error(
        `contract declares no application/json ${c.status} response for ${keyString} — this scenario's expected status is wrong`,
      );
    }
    const diff = diffResponseInstance(schema, c.body, keyString);
    return { key: keyString, status: c.status, operationId: operation.operationId, diff };
  });

  console.log("=".repeat(78));
  console.log("E04-S079 — actual response shape vs contract 2xx schema");
  console.log("=".repeat(78));
  for (const f of findings) {
    const label = f.operationId ? `${f.key}  (${f.operationId})` : f.key;
    console.log(`[${f.status}] ${label}`);
    if (f.diff.extra.length === 0 && f.diff.missing.length === 0) {
      console.log("    MATCH — no extra fields, no missing fields");
    } else {
      if (f.diff.extra.length > 0) console.log(`    EXTRA (potential leak): ${f.diff.extra.join(", ")}`);
      if (f.diff.missing.length > 0) console.log(`    MISSING (would break a consumer): ${f.diff.missing.join(", ")}`);
    }
  }
  const withExtra = findings.filter((f) => f.diff.extra.length > 0).length;
  const withMissing = findings.filter((f) => f.diff.missing.length > 0).length;
  const clean = findings.length - new Set([...findings.filter((f) => f.diff.extra.length > 0 || f.diff.missing.length > 0).map((f) => f.key)]).size;
  console.log(
    `SUMMARY: ${findings.length} routes exercised — clean=${clean}  withExtraFields=${withExtra}  withMissingFields=${withMissing}`,
  );

  // E04-S073 follow-up (2026-09-03, "gate-response-shape") — THREE numbers,
  // not a fraction. "N of N clean" only ever describes the routes this
  // run reached; a route it never called is invisible to that ratio, not
  // counted as a zero. Print the honest denominator (every JSON 2xx
  // operation any contract declares), what this run actually compared,
  // and — by name, never folded into a count — which declared operations
  // it did NOT reach. This does not gate: an uncovered route is neither a
  // failure nor allowlist-eligible, it is a fact about this run's own
  // reach. See README.md "Response-shape coverage: three numbers, not a
  // fraction".
  const coverage = computeResponseShapeCoverage(specs, new Set(findings.map((f) => f.key)));
  console.log("─".repeat(78));
  console.log("COVERAGE (informational — never fails this suite, never allowlist-eligible):");
  console.log(`  declared JSON 2xx operations across all contracts: ${coverage.declared.length}`);
  console.log(`  exercised and compared by this run: ${coverage.exercised.length}`);
  console.log(`  NOT covered by this run: ${coverage.notCovered.length}`);
  if (coverage.notCovered.length > 0) {
    for (const key of coverage.notCovered) console.log(`    not covered: ${key}`);
  }
}, 30_000);

afterAll(async () => {
  await app?.close();
  delete process.env.AI_KM_SEED_DEMO_USERS;
});

describe("E04-S079: actual response body vs contract 2xx schema (real server, real login)", () => {
  it("every exercised route's response carries no field the contract does not declare, and no field the contract requires is missing", () => {
    const violations = findings.filter((f) => f.diff.extra.length > 0 || f.diff.missing.length > 0);
    if (violations.length > 0) {
      // A plain `Error` with the diff EMBEDDED IN THE MESSAGE STRING, not a
      // bare `expect(violations).toEqual([])` — vitest's own JSON reporter
      // (what `tools/mutate.mjs` runs under, and what `--expect-message`
      // matches against) truncates a failed `toEqual`'s object diff to
      // `…(N)` in `failureMessages[0]`; only literal text IN the message
      // itself is guaranteed to survive into that string. Same reasoning
      // `check.live.test.ts`'s own reverse-verification test documents for
      // exactly the same tool.
      const lines = violations.map(
        (v) =>
          `  ${v.key} (status ${v.status}): extra=${JSON.stringify(v.diff.extra)} missing=${JSON.stringify(v.diff.missing)}`,
      );
      throw new Error(
        `${violations.length} route(s) returned a response whose fields do not match the contract's declared 2xx schema:\n${lines.join("\n")}`,
      );
    }
    expect(violations).toEqual([]);
  });

  it("reverse-verification target: GET /v1/admin/metrics/usage matches today (see tools/mutate.mjs run in the E04-S079 spec)", () => {
    const finding = findings.find((f) => f.key === "GET /admin/metrics/usage");
    if (!finding) throw new Error("no captured finding for GET /admin/metrics/usage — scenario list changed?");
    if (finding.diff.extra.length !== 0 || finding.diff.missing.length !== 0) {
      throw new Error(
        `expected GET /admin/metrics/usage to have no extra/missing fields, got extra=${JSON.stringify(
          finding.diff.extra,
        )} missing=${JSON.stringify(finding.diff.missing)}`,
      );
    }
    expect(finding.diff).toEqual({ extra: [], missing: [] });
  });
});
