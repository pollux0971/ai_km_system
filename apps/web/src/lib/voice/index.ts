export { createVoiceRecorder } from "./recorder";
export { encodeWav } from "./wav";
export { resampleLinear } from "./resample";
export { isVoiceCaptureSupported } from "./support";
export { VoiceCaptureError, classifyGetUserMediaError } from "./errors";
export type { VoiceCaptureErrorCode } from "./errors";
export type {
  VoiceCapture,
  VoiceRecorder,
  VoiceRecorderDeps,
  VoiceRecorderOptions,
  VoiceRecorderState,
  VoiceStopReason,
} from "./types";
