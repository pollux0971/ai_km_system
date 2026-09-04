/**
 * Fastify assembly for apps/api (E04-S039, ADR 0003 §1).
 *
 * `buildServer()` is a pure factory returning a non-listening instance, so
 * every test drives the real server through `inject()` rather than a mock of
 * it. `main.ts` is the only place that binds a port.
 *
 * Domain code does NOT live here. Each domain ships a Fastify plugin from
 * `services/<domain>` and is registered below; this file owns only config,
 * logging, correlation, the error envelope, the contract registry and the
 * authentication seam. See README.md for how to add one.
 */
import { randomUUID } from "node:crypto";
import Fastify, { LogController, type FastifyInstance, type FastifyPluginAsync } from "fastify";
import ajvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { Database } from "better-sqlite3";

// See the note in contracts.ts — CJS packages with ESM-shaped typings.
const Ajv2020 = ajvModule.default;
const addFormats = addFormatsModule.default;
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { loadConfig, type ApiConfig } from "./config.js";
import { registerErrorHandling, ApiHttpError, ERROR_CODES } from "./errors.js";
import { registerCorrelation, readCorrelationId } from "./correlation.js";
import { registerAuth } from "./auth-decorator.js";
import { loadContracts, resolveContractsDir, type ContractRegistry } from "./contracts.js";
import { databasePlugin } from "./db/plugin.js";
import { resolveMigrationsDir } from "./db/migrate.js";
import { conversationPlugin, conversationSandboxSeeders, toOwnerKey } from "@ai-km/service-conversation";
import { identityPlugin, registerSandboxSeeder, requireAnyRole } from "@ai-km/service-identity";
import {
  modelGatewayPlugin,
  createModelGateway,
  createDeterministicEmbeddingProvider,
  createCannedGenerationProvider,
  type EmbeddingProvider,
  type GenerateInput,
} from "@ai-km/service-model-gateway";
import { feedbackPlugin } from "@ai-km/service-feedback";
import {
  createInMemoryVectorStore,
  createRetrievalService,
  retrievalPlugin,
  type RetrievalService,
} from "@ai-km/service-retrieval";
import { generationPlugin, createGenerationService } from "@ai-km/service-generation";
import { ragPlugin } from "./rag-plugin.js";
import { createIngestionService, ingestionPlugin, type IngestionService } from "@ai-km/service-ingestion";
import { createHealthChecker, overallStatus } from "./health/checks.js";
import "./types.js";

/**
 * E04-S052: bridges `services/identity`'s sandbox-seeder registry to the
 * conversation domain's own seeders. Composition-root wiring, not a
 * `services/conversation` → `services/identity` dependency (CLAUDE.md 鐵律 3
 * boundary: cross-domain interaction only through a declared interface —
 * here, `registerSandboxSeeder`'s already-declared `(ownerKey) => void`
 * shape).
 *
 * `registerSandboxSeeder` pushes into a bare module-level array with no way
 * to unregister (by design — see its doc comment, it is meant to be called
 * once per real domain at plugin-load time). `buildServer()` is called many
 * times per process in this repo's own test suite, though, so registering a
 * NEW closure on every call — each one permanently bound to that call's
 * `app.db` — would leave every earlier test's (by then closed) database
 * connection in the list, and `runSandboxSeeders` runs every registered
 * seeder unconditionally. The module-level `sandboxDb` cell below is
 * reassigned on every `buildServer()` call but the registration itself
 * happens at most ONCE per process (`sandboxSeederRegistered` guard) — the
 * one registered closure always reads whichever db is CURRENT at the moment
 * a login actually seeds, rather than closing over a specific instance.
 * Safe under this test suite's actual concurrency model (vitest isolates
 * module state per test FILE, and within a file, tests build one server at a
 * time — never two live `buildServer()` instances needing to seed at once).
 *
 * E04-S053: only `conversationSandboxSeeders` is wired in — NOT
 * `messageSandboxSeeders`. The existing 264 E2E specs are written against
 * `apps/web/src/test/fake-api.ts`'s client-side fake, whose sandbox seeds
 * conversations but leaves every one of them empty (`messageStore = []`)
 * — that IS the established contract those specs assert against. Seeding
 * messages too (E04-S052's original scope) made every "opening a
 * conversation should show no messages yet" spec fail. `messageSandboxSeeders`
 * itself is untouched and still exported from `@ai-km/service-conversation`
 * (E04-S042's legitimate output) — a future story that specifically needs
 * seeded messages (e.g. E03-S044) can call it explicitly; it is simply no
 * longer part of the sandbox's DEFAULT starting state.
 */
let sandboxDb: Database | undefined;
let sandboxSeederRegistered = false;

function ensureSandboxSeederRegistered(): void {
  if (sandboxSeederRegistered) return;
  sandboxSeederRegistered = true;
  registerSandboxSeeder((ownerKey) => {
    if (!sandboxDb) return;
    const owner = toOwnerKey(ownerKey);
    for (const seeder of conversationSandboxSeeders) seeder.seed(sandboxDb!, owner);
  });
}

/** contracts/openapi/analytics.yaml's `/admin/health`'s `x-required-roles`, copied verbatim (frozen contract, not this story's to invent). */
const ADMIN_HEALTH_ROLES = ["it_administrator", "ai_administrator", "auditor", "super_administrator"] as const;

export const API_PREFIX = "/v1";

/** Bumped by hand; `/v1/health` reports it so a deploy can be identified. */
export const API_VERSION = "0.1.0";

export interface BuildServerOptions {
  config?: ApiConfig;
  /** Overridden by tests to load fixture contracts instead of the repo's. */
  contractsDir?: string;
  /** Overridden by tests so each run gets its own throwaway SQLite file. */
  dbPath?: string;
  /** Overridden by tests to point at a fixture migrations directory. */
  migrationsDir?: string;
  /**
   * Overridden by tests to capture log output. Only `write` is required —
   * that is all pino calls — so a test sink need not be a full stream.
   */
  loggerStream?: { write(chunk: string): void };
  /**
   * Defaults to "test env or sandbox enabled". Passing `true` in production is
   * refused — see the assertion below.
   */
  enableTestAuthProvider?: boolean;
  /**
   * Registered at the exact point real domain plugins are (E04-S049). Lets a
   * regression test prove `app.contracts` is available at route-registration
   * time — the point a domain plugin's `schema: { body: app.contracts
   * .getSchema(...) }` runs — without adding a fake domain to the real app.
   * `undefined` in production; zero behaviour change when omitted.
   */
  testExtraPlugin?: FastifyPluginAsync;
  /**
   * TEST-ONLY — overrides the embedding provider `app.ingestion`'s own
   * Model Gateway writes vectors with. Defaults to the same deterministic
   * provider `app.retrieval` embeds queries with (below), so omitting this
   * is today's behaviour, byte-for-byte, unchanged.
   *
   * ADR 0015 ("D2 的空守門怎麼補") already refused a `store` override here —
   * that would let a test skip `app.ingestion.ingest()` entirely and poke
   * data straight into the store, a path production never takes. This field
   * cannot do that: whatever provider is supplied still runs behind the
   * REAL `app.ingestion.ingest()` call, into the REAL, shared
   * `retrievalStore` (D1, below) — nothing about the write path changes,
   * only which embedding provider sits underneath it. The judgement call
   * ADR 0015 draws the line on: whether a test seam lets a test bypass the
   * production path, not whether the field is *labelled* test-only.
   *
   * It exists to simulate the passage of time — a chunk indexed under an
   * embedding model that has since been swapped out — which is the ONLY
   * reason `enforceEmbeddingVersion` (below) exists, and which no
   * single-process production call can ever produce on its own: today's
   * `IngestionService.ingest()` has no parameter to pick an embedding
   * version, so index-time and query-time always share the one provider a
   * process was built with.
   */
  ingestionEmbeddingProvider?: EmbeddingProvider;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const enableTestAuthProvider =
    options.enableTestAuthProvider ?? (config.nodeEnv === "test" || config.testSandbox);

  // Defence in depth. loadConfig already refuses production + sandbox, but
  // buildServer can be called with a hand-built config (tests do exactly
  // that), so the guard is repeated at the point where the bypass would
  // actually be wired up.
  if (config.nodeEnv === "production" && enableTestAuthProvider) {
    throw new Error(
      "拒絕啟動:test auth provider(x-test-user)不得在 production 註冊。這會讓任何人以任意身分發出請求。",
    );
  }

  const app = Fastify({
    // The correlation id IS the request id. Deriving it here rather than in a
    // hook means Fastify's own "incoming request" / "request completed" lines
    // carry it too — a hook runs too late to relabel those (AC2).
    genReqId: (raw) => readCorrelationId(raw.headers),
    // `requestIdLogLabel` / `disableRequestLogging` are deprecated in
    // Fastify 5 and removed in 6; the LogController is the supported way to
    // say the same thing, so new code should not be born deprecated.
    logController: new LogController({
      requestIdLogLabel: "correlationId",
      disableRequestLogging: false,
    }),
    logger: {
      level: config.logLevel,
      // Security AC: cookies, authorization headers and bodies never reach the
      // log. Fastify does not log bodies by default; the serialiser below
      // pins the request shape so a future change cannot start doing so.
      redact: {
        paths: [
          "req.headers.cookie",
          "req.headers.authorization",
          "req.headers['x-test-user']",
          "res.headers['set-cookie']",
        ],
        remove: true,
      },
      serializers: {
        req(request: { method: string; url: string }) {
          return { method: request.method, url: request.url };
        },
      },
      ...(options.loggerStream ? { stream: options.loggerStream } : {}),
    },
  });

  registerRequestValidation(app);
  registerCorrelation(app);
  registerErrorHandling(app);

  // E01-S029 AC5 — "equivalent headers" for a JSON API means only the two
  // that still matter for a response that is never rendered as a page:
  // X-Content-Type-Options (stop a browser from MIME-sniffing an error body
  // into something executable) and X-Frame-Options (defence in depth against
  // being framed). Every other helmet default is explicitly turned off
  // rather than left to helmet's own defaults, so this registration adds
  // exactly the two headers the spec asks for — not a browser CSP (this is
  // JSON, never rendered) and not HSTS (that policy belongs to web/admin,
  // whose next.config.ts already gates it on `x-forwarded-proto: https`;
  // duplicating it here with no such gate would send it over the internal
  // plain-http deployment too).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    hsts: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    originAgentCluster: false,
    referrerPolicy: false,
    xDnsPrefetchControl: false,
    xDownloadOptions: false,
    xPermittedCrossDomainPolicies: false,
    xXssProtection: false,
    frameguard: { action: "deny" },
  });

  await app.register(cookie);
  await app.register(multipart);

  // CORS stays entirely unregistered unless an allowlist was configured. The
  // browser talks to /api/v1/* same-origin through the Next rewrite
  // (ADR 0003 §6), so cross-origin is the exception, not the default.
  if (config.corsOrigins.length > 0) {
    await app.register(cors, { origin: [...config.corsOrigins], credentials: true });
  }

  registerAuth(app, { enableTestProvider: enableTestAuthProvider });

  // E04-S049: every app.decorate(...) below MUST complete before any
  // app.register(<route plugin>) call. Fastify's register() awaits a
  // plugin's own body to finish running before resolving, so a domain
  // plugin registered here executes ITS route definitions synchronously —
  // and a route that binds its schema from `app.contracts.getSchema(...)`
  // (apps/api/README.md rule #3) would otherwise find that decorator still
  // undefined. This bit E04-S041 (see its EVIDENCE): the fix is ordering,
  // not the route code, so no route's schema-binding style needs to change.
  const contracts: ContractRegistry = await loadContracts(
    options.contractsDir ?? resolveContractsDir(),
  );
  app.decorate("contracts", contracts);

  // E04-S040 — SQLite connection + migrations (fastify.db).
  await app.register(databasePlugin, {
    dbPath: options.dbPath ?? config.dbPath,
    autoMigrate: config.autoMigrate,
    ...(options.migrationsDir ? { migrationsDir: options.migrationsDir } : {}),
  });

  // E04-S052: `sandboxDb` must point at THIS build's db before any request
  // (in particular a sandbox login) can arrive — reassigned on every
  // `buildServer()` call, registered with `services/identity`'s registry at
  // most once per process. See the module-level comment above.
  sandboxDb = app.db;
  ensureSandboxSeederRegistered();

  // E02-S032 — session-cookie login/logout/session + the real requireSession.
  //
  // E04-S051: registered BEFORE the domain plugins below, not after. Domain
  // routes read `app.requireSession` (directly, or via each package's own
  // `hostRequireSession` proxy) — registering identityPlugin first means
  // the REAL composed session check is already in place before any domain
  // route can observe `app.requireSession` at all, so correctness no
  // longer depends on a domain's own read pattern. This is depth defence
  // on top of E04-S051's actual fix (making `hostRequireSession` read live
  // rather than snapshot): the two are independent safeguards for the same
  // failure mode, same "every decorate/reassignment before any route
  // plugin registers" principle E04-S049 already established for
  // `app.contracts`.
  await app.register(identityPlugin);
  // E04-S040 — conversation domain mount point; routes arrive in E04-S041+.
  //
  // E04-S050: registration is conditional on the "conversations" spec
  // actually being loaded — same pattern the `__test__` routes below already
  // use for "sample". Without this, a conversation route that binds its
  // schema from `app.contracts.getSchema("conversations", ...)` at
  // registration time throws under `apps/api`'s own fixture-only bootstrap
  // tests (`server.test.ts`, `db/migrate.test.ts` — they build the server
  // against `src/testing/fixtures`, which only defines `sample`), forcing
  // every domain route to transcribe its JSON Schema by hand instead
  // (E04-S041 EVIDENCE, then E04-S042 EVIDENCE found this second, independent
  // cause after E04-S049 fixed the first). Skipping registration entirely
  // when the spec isn't loaded means those routes simply don't exist under
  // the fixture — a 404, not a 500 at boot, and no auth bypass (Security AC:
  // there is nothing to authorize because the route was never registered).
  if (contracts.specNames().includes("conversations")) {
    await app.register(conversationPlugin);
  }
  // E13-S019 — usage-events + admin metrics/feedback read model. Same
  // conditional-registration guard as `conversationPlugin` above, and for
  // the identical reason: its routes bind schemas from `app.contracts
  // .getSchema("analytics", ...)` at registration time.
  if (contracts.specNames().includes("analytics")) {
    await app.register(feedbackPlugin);
  }
  // 06-retrieval/phase-2 (I2, ADR 0014) — puts `app.retrieval` on the parent
  // instance so 07-generation can call `retrieve()`. Unlike
  // conversationPlugin/feedbackPlugin above, there is no `contracts/openapi`
  // spec to gate on (06-retrieval FEATURE.md: "無直接 HTTP 契約(in-process
  // 接縫,ADR 0007)"), so this registers unconditionally, same as
  // modelGatewayPlugin below.
  //
  // ADR 0015 決策 1/2(05-ingestion/phase-2)— composition root 自己建 store 與
  // `RetrievalService`,再把它交給 `retrievalPlugin`,而不是讓 plugin 自己在
  // 內部生一個沒人拿得到的 store(`retrievalPlugin` 的 `store` option 是
  // TEST-ONLY seam,E06-S026,ADR 0015 明文否決把它當生產路徑)。
  // `enforceEmbeddingVersion: true` 顯式打開——`plugin.ts` 的文件寫明 caller
  // 自供 `service` 時 plugin 不再替它決定這個值,漏掉就是 §5.1「靜默給出錯誤
  // 結果」。
  //
  // `retrievalStore` 是 ADR 0015 決策 1 要 `app.ingestion` 共用寫入的同一個
  // store。ADR 0015 的 D3(自動 seeder)已由 **D3′** 取代:`app.ingestion` 是
  // on-demand 接縫,不掛任何自動 seeder——登入／開機觸發的自動 seed 會把
  // phase-2 場景 4 的「第二個 server 是空的」弄假。
  const retrievalStore = createInMemoryVectorStore();
  const retrievalService: RetrievalService = createRetrievalService({
    store: retrievalStore,
    enforceEmbeddingVersion: true,
  });
  await app.register(retrievalPlugin, { service: retrievalService });
  // ADR 0015 決策 3′(取代原決策 3——原文用 `registerSandboxSeeder` 樣式與
  // D4「重開就沒了」互相矛盾:那個樣式在登入或開機時自動觸發,`05-ingestion/
  // phase-2.feature` 的第二個 server 也會登入 demo-user,自動 seed 會把它的
  // store 也灌滿,讓 D4 要驗的「不存活到下一個 process」變成假的)。
  // `app.ingestion` 因此是 **on-demand** 接縫,不掛任何自動 seeder——roadmap
  // 原文的「一條指令」就是一次明確的呼叫(demo script / 測試步驟 / 未來 CLI),
  // 不是開機或登入時偷偷發生的事。與 `retrievalPlugin` 共用同一個
  // `retrievalStore`(決策 1 不變),讓「索引寫到 A、查詢讀 B」不成立。
  // embedding 預設用同一顆 deterministic provider(與 `createRetrievalService`
  // 的預設一致:"embedding:deterministic" / 256 維),確保 index-time 與
  // query-time 的 embedding 身分相同——除非 `options.ingestionEmbeddingProvider`
  // 被覆寫(見 `BuildServerOptions` 的欄位文件:test-only,但資料仍走真實
  // `app.ingestion.ingest()` 與這個共用的 `retrievalStore`,只換嵌入身分)。
  const ingestionModelGateway = createModelGateway({
    embedding: options.ingestionEmbeddingProvider ?? createDeterministicEmbeddingProvider(),
    generation: createCannedGenerationProvider(),
  });
  const ingestionService: IngestionService = createIngestionService({
    modelGateway: ingestionModelGateway,
    vectorStore: retrievalStore,
  });
  await app.register(ingestionPlugin, { service: ingestionService });
  // 07-generation/phase-1 (回填) — puts `app.generation` on the parent
  // instance. Same "no HTTP contract, unconditional registration" shape as
  // retrievalPlugin above (FEATURE.md: in-process seam, ADR 0007).
  //
  // 03-conversation/phase-2 (I2, ADR 0016 D2): a message's `[N]` citation
  // markers must line up with `citations[]`'s array order. The DEFAULT
  // canned generation provider's `answerTemplate` (`services/model-gateway/
  // src/generation/canned.provider.ts`) prints `[canned] 依據 N 段來源回答:
  // …` — no `[N]` markers at all. That provider is shared infra used by
  // several composition roots (this one is not its only caller — see its own
  // header), so this file does not change it; instead it supplies its own
  // `answerTemplate` here, at the one composition root that needs markers,
  // via the `CannedProviderOptions` hook that already existed for exactly
  // this. `citations[i]` is built from `input.context[i]` in that same
  // provider (see its `citations` map), so numbering markers over
  // `input.context` in order reproduces the exact same order — nothing here
  // re-sorts or re-derives that mapping.
  const markedCannedAnswerTemplate = (input: GenerateInput): string =>
    `依 ${input.context.length} 段來源回答:${input.question}` +
    input.context.map((_, index) => `[${index + 1}]`).join("");
  await app.register(generationPlugin, {
    service: createGenerationService({
      generation: createCannedGenerationProvider({ answerTemplate: markedCannedAnswerTemplate }),
    }),
  });
  // 07-generation/phase-2 (I2, ADR 0014) — the first production call site
  // that actually chains `app.retrieval.retrieve()` into
  // `app.generation.answer()`, under ADR 0014's fixed `dept:eng` scope. See
  // `./rag-plugin.ts`'s header for the full reasoning (phase-2.feature
  // "design judgement A", and ADR 0014's "這份 ADR 的一個空保證"). Registered
  // after both of the plugins above so `app.retrieval` / `app.generation`
  // are already decorated when this plugin's own body runs (E04-S049's
  // ordering rule), though `app.rag.ask()` only reads them lazily at call
  // time, not at registration time.
  await app.register(ragPlugin);
  // E12-S031 — POST /v1/transcriptions (ASR). config.ts is outside this
  // story's allowed-modify list, so the two fields it already reads
  // (E04-S039) are passed through here rather than re-read.
  await app.register(modelGatewayPlugin, {
    nodeEnv: config.nodeEnv,
    asrProvider: config.asrProvider,
    asrServerUrl: config.asrServerUrl,
  });

  if (options.testExtraPlugin) {
    await app.register(options.testExtraPlugin);
  }

  const startedAt = Date.now();
  // E04-S047. One checker per buildServer() call — see createHealthChecker's
  // docstring for why this is not a module-level singleton.
  const healthChecker = createHealthChecker({
    db: app.db,
    migrationsDir: options.migrationsDir ?? resolveMigrationsDir(),
    config,
  });

  // Unauthenticated (AC1): every lane's own E2E setup polls this with
  // `curl -sf`, which only tolerates a 2xx — so this ALWAYS returns 200,
  // carrying the aggregate `status` rather than the HTTP status code. No
  // subsystem detail here (would leak internal topology to a caller who
  // has not proven who they are); that detail is what AC2's
  // `/v1/admin/health` is for.
  app.get(`${API_PREFIX}/health`, async () => {
    const health = await healthChecker.getHealth();
    return {
      status: overallStatus(health),
      version: API_VERSION,
      uptimeMs: Date.now() - startedAt,
    };
  });

  // AC2: role-gated, full detail. `app.requireSession` is read here — after
  // identityPlugin's registration above — not snapshotted earlier, for the
  // same live-read reason E04-S051 fixed `hostRequireSession` over.
  app.get(
    `${API_PREFIX}/admin/health`,
    { preHandler: [app.requireSession, requireAnyRole([...ADMIN_HEALTH_ROLES])] },
    async () => healthChecker.getHealth(),
  );

  // Test-only routes exercising the platform behaviours (contract-bound
  // validation, the error envelope, requireSession). Gated on BOTH
  // "not production" and "the test fixture spec is loaded" — that fixture
  // lives under src/testing/fixtures and is only ever passed in by a test, so
  // these routes cannot appear on a dev server, let alone a deployed one.
  // Deliberately NOT gated on the auth provider: proving that `x-test-user`
  // is ignored while the provider is off needs the protected route to exist.
  const enableTestRoutes = config.nodeEnv !== "production" && contracts.specNames().includes("sample");
  if (enableTestRoutes) {
    await app.register(async (scope) => {
      scope.post(
        `${API_PREFIX}/__test__/widgets`,
        { schema: { body: contracts.getSchema("sample", "CreateWidgetRequest") } },
        async (_request, reply) => {
          void reply.status(201);
          return { id: randomUUID(), name: "widget" };
        },
      );

      scope.get(`${API_PREFIX}/__test__/boom`, async () => {
        throw new Error("kaboom-internal-detail");
      });

      scope.get(`${API_PREFIX}/__test__/conflict`, async () => {
        throw new ApiHttpError(ERROR_CODES.CONFLICT, 409, "資料狀態衝突,請重新載入後再試。");
      });

      scope.get(
        `${API_PREFIX}/__test__/protected`,
        { preHandler: app.requireSession },
        async (request) => ({
          userId: request.auth?.userId,
          ownerKey: request.auth?.ownerKey,
        }),
      );
    });
  }

  await app.ready();
  return app;
}

/**
 * Fastify's stock Ajv runs with `removeAdditional: true`, which SILENTLY
 * DROPS a property the contract does not declare. For a contract-first API
 * that is the wrong default twice over: the client is told its request
 * succeeded when part of it was discarded, and a typo'd field name becomes
 * invisible instead of a 400.
 *
 * Bodies are therefore validated strictly and without type coercion — the
 * contract says `integer`, so `"3"` is a client bug, not something to paper
 * over. Query strings, params and headers are always strings on the wire and
 * so keep coercion; refusing it there would make every numeric query
 * parameter impossible to express.
 */
function registerRequestValidation(app: FastifyInstance): void {
  const strict = new Ajv2020({ strict: false, allErrors: true, removeAdditional: false, coerceTypes: false, useDefaults: true });
  const coercing = new Ajv2020({ strict: false, allErrors: true, removeAdditional: false, coerceTypes: "array", useDefaults: true });
  addFormats(strict);
  addFormats(coercing);

  app.setValidatorCompiler(({ schema, httpPart }) => {
    const ajv = httpPart === "body" || httpPart === undefined ? strict : coercing;
    return ajv.compile(schema as object);
  });
}

declare module "fastify" {
  interface FastifyInstance {
    /** The frozen contracts, for routes that bind their schemas from them. */
    contracts: ContractRegistry;
  }
}
