/**
 * `POST /v1/transcriptions` (E12-S031, contracts/openapi/transcriptions.yaml).
 *
 * Every failure this route knows about is replied directly
 * (`reply.status(...).send(...)`) rather than thrown, matching the exact
 * contract-required `code`/`details` shape for each status — see EVIDENCE
 * "Assumptions" for why: `apps/api/src/errors.ts` (outside this story's
 * allowed-modify list) only special-cases its own `ApiHttpError` for
 * `details`, and maps 503/504 to the platform-generic `SERVICE_UNAVAILABLE`/
 * `GATEWAY_TIMEOUT` codes rather than this contract's endpoint-specific
 * `ASR_UNAVAILABLE`/`ASR_TIMEOUT`. Only a genuinely unexpected error is
 * allowed to propagate to the host's generic 500 handler (contract-correct
 * there — `InternalErrorBody.code` is the same `INTERNAL_ERROR` both use).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
// Type-only: brings in `@fastify/multipart`'s `declare module 'fastify'`
// augmentation (`FastifyRequest.parts()`, used below) so this file
// typechecks on its own merits, not by coincidentally being compiled
// alongside `testing/build-test-app.ts` (which registers the plugin for
// real). Erased at build — the host app registers the actual plugin.
import type {} from "@fastify/multipart";
import { hostRequireSession, requestAuth } from "../plugin-types.js";
import { parseAndValidateWav, WavValidationError, type WavRejectionReason } from "../asr/wav.js";
import { normalizeTranscript } from "../asr/normalize.js";
import {
  AsrTimeoutError,
  AsrUnavailableError,
  type TranscriptionProvider,
} from "../asr/provider.js";

const PREFIX = "/v1";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4 MiB, contract TranscriptionRequest.audio description
const DEFAULT_RECOGNITION_TIMEOUT_MS = 30000;
const RECOGNITION_PROMPT_ZH = "以下是台灣繁體中文與英文混合的工作對話。";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TranscriptionRejectionReason = WavRejectionReason | "MISSING_AUDIO";

export interface TelemetryLogger {
  info(fields: Record<string, unknown>, message: string): void;
}

export interface RegisterTranscriptionRoutesOptions {
  readonly provider: TranscriptionProvider;
  readonly telemetry?: TelemetryLogger;
  /** Overridden by tests so an AC4 timeout test doesn't wait 30s for real. */
  readonly timeoutMs?: number;
}

function sendValidationError(
  reply: FastifyReply,
  reason: TranscriptionRejectionReason,
  message: string,
): void {
  void reply.status(400).send({ code: "VALIDATION_ERROR", message, details: { reason } });
}

export function registerTranscriptionRoutes(
  app: FastifyInstance,
  options: RegisterTranscriptionRoutesOptions,
): void {
  const requireSession = hostRequireSession(app);
  const { provider } = options;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RECOGNITION_TIMEOUT_MS;

  app.post(`${PREFIX}/transcriptions`, { preHandler: requireSession }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = requestAuth(request);
    // Unreachable in practice — requireSession always runs first and
    // throws before this body executes — but fail closed rather than
    // assume (same pattern services/conversation's routes use).
    if (!auth) {
      void reply.status(401).send({ code: "UNAUTHENTICATED", message: "請先登入。" });
      return;
    }

    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
      void reply
        .status(415)
        .send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "僅接受 multipart/form-data 的 audio/wav 錄音。" });
      return;
    }

    let audioBuffer: Buffer | undefined;
    let language: "zh" | "en" = "zh";
    let conversationId: string | undefined;
    let unsupportedMediaType = false;

    try {
      const parts = request.parts({ limits: { fileSize: MAX_AUDIO_BYTES } });
      for await (const part of parts) {
        if (part.type === "file") {
          if (part.fieldname !== "audio") {
            await part.toBuffer();
            continue;
          }
          const mimetype = part.mimetype.toLowerCase();
          if (mimetype !== "audio/wav" && mimetype !== "audio/x-wav" && mimetype !== "audio/wave") {
            unsupportedMediaType = true;
            await part.toBuffer();
            continue;
          }
          audioBuffer = await part.toBuffer();
          if (part.file.truncated) {
            void reply.status(413).send({ code: "PAYLOAD_TOO_LARGE", message: "錄音檔案超過 4MB 上限。" });
            return;
          }
        } else if (part.fieldname === "language") {
          if (part.value === "zh" || part.value === "en") language = part.value;
        } else if (part.fieldname === "conversationId") {
          const raw = String(part.value);
          // Spec Data Acceptance: conversationId is optional and NOT an
          // authorization input — supplying a malformed one gains the
          // caller nothing, so an invalid value is quietly dropped rather
          // than rejected. See EVIDENCE "Assumptions": the contract's
          // TranscriptionRejectionReason enum has no value that fits
          // "malformed conversationId", so a compliant 400 for this case
          // cannot be produced without a contract change out of this
          // story's scope.
          if (UUID_RE.test(raw)) conversationId = raw;
        }
      }
    } catch (error) {
      const code = (error as { code?: string } | undefined)?.code;
      if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_FILES_LIMIT") {
        void reply.status(413).send({ code: "PAYLOAD_TOO_LARGE", message: "錄音檔案超過 4MB 上限。" });
        return;
      }
      throw error;
    }

    if (unsupportedMediaType) {
      void reply
        .status(415)
        .send({ code: "UNSUPPORTED_MEDIA_TYPE", message: "僅接受 multipart/form-data 的 audio/wav 錄音。" });
      return;
    }
    if (!audioBuffer) {
      sendValidationError(reply, "MISSING_AUDIO", "沒有收到錄音內容。");
      return;
    }

    let parsedWav;
    try {
      parsedWav = parseAndValidateWav(audioBuffer);
    } catch (error) {
      if (error instanceof WavValidationError) {
        sendValidationError(reply, error.reason, error.message);
        return;
      }
      throw error;
    }

    const correlationId =
      (request.headers["x-correlation-id"] as string | undefined) ?? request.id;
    const startedAt = Date.now();

    let result;
    try {
      result = await provider.transcribe({
        wav: audioBuffer,
        language,
        ...(language === "zh" ? { prompt: RECOGNITION_PROMPT_ZH } : {}),
        timeoutMs,
        correlationId,
      });
    } catch (error) {
      if (error instanceof AsrUnavailableError) {
        void reply.status(503).send({ code: "ASR_UNAVAILABLE", message: error.message });
        return;
      }
      if (error instanceof AsrTimeoutError) {
        void reply.status(504).send({ code: "ASR_TIMEOUT", message: error.message });
        return;
      }
      throw error;
    }

    const processingMs = Date.now() - startedAt;
    const text = normalizeTranscript(result.rawText);

    // Security/Observability Acceptance: metadata only, never the text.
    options.telemetry?.info(
      {
        durationMs: Math.round(parsedWav.durationMs),
        processingMs,
        textLength: text.length,
        provider: provider.name,
        model: provider.model,
        correlationId,
        ...(conversationId ? { conversationId } : {}),
      },
      "transcription completed",
    );

    return {
      text,
      rawText: result.rawText,
      language: result.language,
      durationMs: Math.round(parsedWav.durationMs),
      processingMs,
      provider: provider.name,
      model: provider.model,
    };
  });
}
