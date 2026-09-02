export { modelGatewayPlugin, ModelGatewayConfigError } from "./plugin.js";
export type { ModelGatewayOptions } from "./plugin.js";
export type {
  TranscriptionProvider,
  TranscriptionProviderName,
  TranscriptionLanguage,
  TranscribeInput,
  TranscribeResult,
} from "./asr/provider.js";
export { WhisperServerProvider, FakeTranscriptionProvider, AsrUnavailableError, AsrTimeoutError } from "./asr/provider.js";
export { normalizeTranscript } from "./asr/normalize.js";
export { parseAndValidateWav, tryParseWavHeader, WavValidationError } from "./asr/wav.js";
export type { ParsedWav, WavRejectionReason } from "./asr/wav.js";

// --- Model Gateway: embedding / generation (2026-09-02 g1-g4) ---
// The in-process API is the primary path; `POST /v1/embeddings` and
// `POST /v1/generate` are thin wrappers over these same functions.
export { createModelGateway } from "./gateway.js";
export type {
  ModelGateway,
  ModelGatewayDeps,
  EmbedRequest,
  EmbedResponse,
  GenerateRequest,
  GenerateResponse,
} from "./gateway.js";
export {
  ModelGatewayValidationError,
  ModelGatewayPayloadTooLargeError,
  GenerationNoContextError,
} from "./gateway.js";
export { EmbeddingUnavailableError } from "./embedding/provider.js";
export type { EmbeddingProvider, EmbedInput, EmbedResult } from "./embedding/provider.js";
export { createDeterministicEmbeddingProvider } from "./embedding/deterministic.provider.js";
export {
  GenerationUnavailableError,
  FabricatedCitationError,
  assertCitationsGrounded,
} from "./generation/provider.js";
export type {
  GenerationProvider,
  GenerateInput,
  GenerateResult,
  ContextChunk,
  Citation,
} from "./generation/provider.js";
export { createCannedGenerationProvider } from "./generation/canned.provider.js";
export type { CannedProviderOptions } from "./generation/canned.provider.js";
export type { ProviderFidelity } from "./fidelity.js";
export {
  registerEmbeddingRoutes,
  registerGenerationRoutes,
} from "./routes/model-gateway-routes.js";
