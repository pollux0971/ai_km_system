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
import { resolveModelGatewayConfig, type ModelGatewayOptions } from "./config.js";
import {
  FakeTranscriptionProvider,
  WhisperServerProvider,
  type TranscriptionProvider,
} from "./asr/provider.js";
import { registerTranscriptionRoutes, type TelemetryLogger } from "./routes/transcriptions.js";

export type { ModelGatewayOptions } from "./config.js";
export { ModelGatewayConfigError } from "./config.js";

function buildProvider(config: ReturnType<typeof resolveModelGatewayConfig>): TranscriptionProvider {
  if (config.asrProvider === "fake") {
    return new FakeTranscriptionProvider(config.fakeText);
  }
  return new WhisperServerProvider({ serverUrl: config.asrServerUrl });
}

export const modelGatewayPlugin: FastifyPluginAsync<ModelGatewayOptions> = async (app, options) => {
  const config = resolveModelGatewayConfig(options);
  const provider = buildProvider(config);
  const telemetry: TelemetryLogger = app.log;
  registerTranscriptionRoutes(app, { provider, telemetry });
};
