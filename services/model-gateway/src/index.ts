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
