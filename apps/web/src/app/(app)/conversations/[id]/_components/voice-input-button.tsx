"use client";

import { useEffect, useRef, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { trackEvent } from "@/lib/telemetry";
import { transcribeAudio } from "@/lib/transcription";
import {
  createVoiceRecorder,
  isVoiceCaptureSupported,
  VoiceCaptureError,
  type VoiceCapture,
  type VoiceRecorder,
  type VoiceStopReason,
} from "@/lib/voice";
import { VoiceVisualizer } from "@/components/voice/voice-visualizer";

const logger = createLogger("web:voice-input-button");

type UiState = "idle" | "requesting" | "listening" | "transcribing";

export interface VoiceInputButtonProps {
  conversationId: string;
  disabled?: boolean;
  /**
   * Called only when there is non-empty recognized text. Returns whether
   * the caller (MessageComposer) auto-submitted it (empty draft) or
   * appended it to an existing draft instead — this component's own
   * `conversation_voice_transcribe_success` telemetry needs that to set
   * `autoSent`, and MessageComposer is the one that actually knows which
   * happened.
   */
  onTranscript: (text: string) => boolean;
}

function unsupportedReason(): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "語音輸入需要 HTTPS 連線";
  }
  return "此瀏覽器不支援語音輸入";
}

function startErrorMessage(error: unknown): string {
  if (error instanceof VoiceCaptureError) {
    switch (error.code) {
      case "PERMISSION_DENIED":
        return "瀏覽器未授權麥克風";
      case "NO_DEVICE":
        return "找不到麥克風";
      case "DEVICE_BUSY":
        return "麥克風正被其他程式使用中";
      case "NOT_SUPPORTED":
        return unsupportedReason();
      default:
        return "語音輸入發生未知錯誤，請再試一次";
    }
  }
  return "語音輸入發生未知錯誤，請再試一次";
}

function transcribeErrorMessage(code: string, reason?: string): string {
  if (code === "VALIDATION_ERROR" && reason === "AUDIO_TOO_SHORT") return "錄音太短，請再說一次";
  if (code === "ASR_UNAVAILABLE" || code === "ASR_TIMEOUT") return "語音辨識服務暫時無法使用";
  return "語音辨識發生錯誤，請再試一次";
}

/**
 * E03-S041 push-to-talk voice input button. State machine:
 * idle -> requesting -> listening -> transcribing -> idle; any state can
 * fall back to idle on error. Uses E03-S040's `createVoiceRecorder()` and
 * E03-S042's `<VoiceVisualizer>` — this component owns none of the
 * recording/VAD/visual logic itself, only the push-to-talk interaction
 * and the transcribe-then-auto-submit-or-append decision (delegated to
 * `onTranscript`, see its doc comment).
 */
export function VoiceInputButton({ conversationId, disabled = false, onTranscript }: VoiceInputButtonProps) {
  const [uiState, setUiState] = useState<UiState>("idle");
  const [level, setLevel] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const supported = isVoiceCaptureSupported();

  function getOrCreateRecorder(): VoiceRecorder {
    if (recorderRef.current) return recorderRef.current;
    const recorder = createVoiceRecorder();
    recorder.onLevel(setLevel);
    recorder.onStateChange((state) => {
      if (state === "recording") setUiState("listening");
    });
    recorder.onAutoStop((capture, reason) => {
      void handleCaptureComplete(capture, reason);
    });
    recorderRef.current = recorder;
    return recorder;
  }

  async function handleCaptureComplete(
    capture: VoiceCapture | null,
    reason: VoiceStopReason,
  ): Promise<void> {
    trackEvent("conversation_voice_capture_stop", {
      properties: { conversationId, reason, durationMs: capture?.durationMs ?? 0 },
    });

    if (reason === "cancel") {
      setUiState("idle");
      setStatusMessage(null);
      setHasError(false);
      return;
    }

    if (!capture) {
      // Client-side TOO_SHORT (E03-S040) — never reached the server.
      setUiState("idle");
      setStatusMessage("錄音太短，請再說一次");
      setHasError(true);
      return;
    }

    setUiState("transcribing");
    setStatusMessage("辨識中…");
    setHasError(false);

    const result = await transcribeAudio(capture.wav, { language: "zh", conversationId });

    if (!result.ok) {
      trackEvent("conversation_voice_transcribe_failed", {
        properties: { code: result.error.code, reason: result.error.details?.reason },
      });
      setUiState("idle");
      setStatusMessage(transcribeErrorMessage(result.error.code, result.error.details?.reason as string | undefined));
      setHasError(true);
      return;
    }

    const text = result.value.text;
    let autoSent = false;
    if (text.length > 0) {
      autoSent = onTranscript(text);
    }

    trackEvent("conversation_voice_transcribe_success", {
      properties: {
        durationMs: result.value.durationMs,
        processingMs: result.value.processingMs,
        textLength: text.length,
        autoSent,
      },
    });

    setUiState("idle");
    // Contract: an empty result is a success ("the user simply did not
    // say anything the model could hear"), not an error — the visualizer
    // should not shake/alarm for it, only the status text should say so.
    setHasError(false);
    setStatusMessage(text.length === 0 ? "沒有辨識到內容，請再試一次" : null);
  }

  async function handleStart(): Promise<void> {
    setUiState("requesting");
    setStatusMessage(null);
    setHasError(false);
    const correlationId = crypto.randomUUID();
    trackEvent("conversation_voice_capture_start", { correlationId, properties: { conversationId } });

    try {
      await getOrCreateRecorder().start();
    } catch (error) {
      logger.info("voice capture failed to start", {
        correlationId,
        code: error instanceof VoiceCaptureError ? error.code : "UNKNOWN",
      });
      setUiState("idle");
      setStatusMessage(startErrorMessage(error));
      setHasError(true);
    }
  }

  async function handleStop(reason: "manual" | "cancel"): Promise<void> {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const capture = await recorder.stop(reason).catch(() => null);
    await handleCaptureComplete(capture, reason);
  }

  function handleClick(): void {
    if (uiState === "idle") void handleStart();
    else if (uiState === "listening") void handleStop("manual");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>): void {
    if (event.key === "Escape" && uiState === "listening") {
      event.preventDefault();
      void handleStop("cancel");
    }
  }

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && (recorder.state === "recording" || recorder.state === "requesting")) {
        void recorder.stop("cancel");
      }
    };
  }, []);

  const isDisabled = disabled || !supported || uiState === "requesting" || uiState === "transcribing";
  const accessibleName = uiState === "listening" ? "停止錄音" : "語音輸入";
  const visualizerState =
    uiState === "listening" ? "listening" : uiState === "transcribing" ? "transcribing" : hasError ? "error" : "idle";
  const title = !supported ? unsupportedReason() : statusMessage ?? accessibleName;

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
      <button
        type="button"
        aria-pressed={uiState === "listening"}
        aria-label={accessibleName}
        title={title}
        disabled={isDisabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      >
        <VoiceVisualizer state={visualizerState} level={level} size={40} />
      </button>
      <p aria-live="polite" style={{ margin: 0, fontSize: 12 }}>
        {uiState === "listening" ? "聆聽中…" : uiState === "transcribing" ? "辨識中…" : (statusMessage ?? "")}
      </p>
    </span>
  );
}
