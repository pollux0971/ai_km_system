import { toResult } from "@ai-km/api-client";
import type { TranscriptionsComponents } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { apiClient } from "./api";

export type TranscriptionLanguage = TranscriptionsComponents["schemas"]["TranscriptionLanguage"];
export type Transcription = TranscriptionsComponents["schemas"]["Transcription"];

export interface TranscribeAudioOptions {
  language?: TranscriptionLanguage;
  conversationId?: string;
}

/**
 * `POST /transcriptions` (E12-S029/E12-S031). `wav` must already be a
 * 16kHz mono PCM16 WAV `Blob` (E03-S040's `VoiceCapture.wav`) — this
 * function does no re-encoding, it only uploads.
 *
 * openapi-fetch's `defaultBodySerializer` passes a `FormData` body
 * through untouched (letting the browser set `Content-Type`/boundary),
 * which is why `body` is built as `FormData` here rather than the plain
 * `TranscriptionRequest` object shape the generated type names — the
 * generated type describes the *wire* shape (`audio` as `format: binary`
 * string), not what a multipart caller constructs client-side.
 */
export async function transcribeAudio(
  wav: Blob,
  options: TranscribeAudioOptions = {},
): Promise<Result<Transcription, ApiError>> {
  const formData = new FormData();
  formData.set("audio", wav, "audio.wav");
  formData.set("language", options.language ?? "zh");
  if (options.conversationId) {
    formData.set("conversationId", options.conversationId);
  }

  return toResult(
    apiClient.transcriptions.POST("/transcriptions", {
      body: formData as unknown as TranscriptionsComponents["schemas"]["TranscriptionRequest"],
    }),
  );
}
