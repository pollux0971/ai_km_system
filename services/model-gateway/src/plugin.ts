/**
 * Model-gateway domain Fastify plugin (E12-S031).
 *
 * `apps/api/src/server.ts` passes `{nodeEnv, asrProvider, asrServerUrl}`
 * from its own `ApiConfig` (already reads `AI_KM_ASR_PROVIDER`/
 * `AI_KM_ASR_SERVER_URL` — E04-S039 scaffolded those two fields ahead of
 * time) as this plugin's registration options, since `apps/api/src/
 * config.ts` itself is outside this story's allowed-modify list.
 */
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import {
  assertProviderUsable,
  ModelGatewayConfigError,
  resolveModelGatewayConfig,
  type ModelGatewayOptions,
} from "./config.js";
import {
  FakeTranscriptionProvider,
  WhisperServerProvider,
  type TranscriptionProvider,
} from "./asr/provider.js";
import { registerTranscriptionRoutes, type TelemetryLogger } from "./routes/transcriptions.js";
import { createDeterministicEmbeddingProvider } from "./embedding/deterministic.provider.js";
import { HttpEmbeddingProvider } from "./embedding/http.provider.js";
import type { EmbeddingProvider } from "./embedding/provider.js";
import { createCannedGenerationProvider } from "./generation/canned.provider.js";
import { createModelGateway, type ModelGateway } from "./gateway.js";
import {
  registerEmbeddingRoutes,
  registerGenerationRoutes,
} from "./routes/model-gateway-routes.js";
import { hostSpecNames } from "./plugin-types.js";

export type { ModelGatewayOptions } from "./config.js";
export { ModelGatewayConfigError } from "./config.js";

function buildProvider(config: ReturnType<typeof resolveModelGatewayConfig>): TranscriptionProvider {
  if (config.asrProvider === "fake") {
    return new FakeTranscriptionProvider(config.fakeText);
  }
  return new WhisperServerProvider({ serverUrl: config.asrServerUrl });
}

/**
 * E04-S088 follow-up (coordinator review, GHERKIN_WORKFLOW §5.5 — allowed-
 * modify list widened to include this file): the ONLY place that decides
 * which embedding provider gets CONSTRUCTED. `assertProviderUsable` below
 * checks what this function actually returns, not the config string, so the
 * two cannot silently drift the way they did before this follow-up (config
 * said "llama-server" was a legal value; this file still always built the
 * 256-dim deterministic placeholder; the guard only ever looked at the
 * string and said OK).
 */
function buildEmbeddingProvider(config: ReturnType<typeof resolveModelGatewayConfig>): EmbeddingProvider {
  if (config.embeddingProvider === "llama-server") {
    // `resolveModelGatewayConfig` guarantees `embeddingServerUrl` is set
    // whenever `embeddingProvider` resolves to `"llama-server"` (config.ts's
    // own validation). This check documents that invariant rather than
    // silently trusting it — if config.ts's guarantee is ever weakened, this
    // fails loudly here instead of constructing an `HttpEmbeddingProvider`
    // pointed at `undefined`.
    if (!config.embeddingServerUrl) {
      throw new ModelGatewayConfigError(
        'embeddingProvider="llama-server" 但 embeddingServerUrl 未設定——這是 ' +
          "resolveModelGatewayConfig 的不變量被打破,不是可修的執行期設定問題。",
      );
    }
    return new HttpEmbeddingProvider({ serverUrl: config.embeddingServerUrl });
  }
  return createDeterministicEmbeddingProvider({ dimensions: config.embeddingDimensions });
}

const modelGatewayPluginImpl: FastifyPluginAsync<ModelGatewayOptions> = async (app, options) => {
  const config = resolveModelGatewayConfig(options);
  const provider = buildProvider(config);
  const telemetry: TelemetryLogger = app.log;

  // The in-process gateway is decorated BEFORE any route is registered.
  // E04-S049's defect was the opposite order: routes registered first, then
  // the decoration they depended on. Same trap, avoided by construction.
  const embeddingProvider = buildEmbeddingProvider(config);
  const generationProvider = createCannedGenerationProvider();
  const gateway: ModelGateway = createModelGateway({
    embedding: embeddingProvider,
    generation: generationProvider,
  });
  app.decorate("modelGateway", gateway);

  registerTranscriptionRoutes(app, { provider, telemetry });

  // Conditional registration, matching `conversationPlugin` / `feedbackPlugin`
  // in `apps/api/src/server.ts`. See `hostSpecNames` for why the guard lives
  // here rather than at the call site: transcriptions must stay unconditional.
  //
  // `assertProviderUsable` is handed the ACTUAL provider instance
  // (`embeddingProvider`/`generationProvider`), not just the declared config
  // string — see that function's doc comment for why the string alone used
  // to let "declared llama-server, built deterministic" pass silently.
  const specs = hostSpecNames(app);
  if (specs.includes("embedding")) {
    assertProviderUsable(config.nodeEnv, "embedding", config.embeddingProvider, embeddingProvider);
    registerEmbeddingRoutes(app, { gateway, telemetry });
  }
  if (specs.includes("generation")) {
    assertProviderUsable(config.nodeEnv, "generation", config.generationProvider, generationProvider);
    registerGenerationRoutes(app, { gateway, telemetry });
  }
};

/**
 * Wrapped in `fastify-plugin`, for the same reason `identityPlugin` and
 * `conversationPlugin` are.
 *
 * Fastify encapsulates a plugin by default: `app.decorate("modelGateway", …)`
 * inside an unwrapped plugin lands on a CHILD instance and is invisible to
 * every sibling. The routes still register and still serve, so the failure is
 * silent — `POST /v1/generate` answers correctly while `services/retrieval`
 * sees `app.modelGateway === undefined` and the whole in-process seam, which
 * is the PRIMARY path per the 2026-09-02 decision, does not exist.
 *
 * Found by probing a real `buildServer()`, not by the test suite: this
 * package's own route tests mount the handlers directly (`build-gateway-test-
 * app.ts`), so they never exercise plugin encapsulation at all. That gap is
 * now covered by `plugin.test.ts`.
 */
export const modelGatewayPlugin = fp(modelGatewayPluginImpl, { name: "ai-km-model-gateway" });
