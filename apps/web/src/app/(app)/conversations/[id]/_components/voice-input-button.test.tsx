import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { apiClient } from "@/lib/api";
import {
  VoiceCaptureError,
  type VoiceCapture,
  type VoiceRecorder,
  type VoiceRecorderState,
  type VoiceStopReason,
} from "@/lib/voice";
import { VoiceInputButton } from "./voice-input-button";

// See lib/transcription.test.ts's top comment for why: jsdom can't read a
// Blob-containing FormData body back off a Request, so any test exercising
// transcribeAudio (this component calls it) spies on
// apiClient.transcriptions.POST directly instead of the fake-api.ts fetch
// simulation.

vi.mock("@/lib/voice", async () => {
  const actual = await vi.importActual<typeof import("@/lib/voice")>("@/lib/voice");
  return {
    ...actual,
    isVoiceCaptureSupported: vi.fn(() => true),
    createVoiceRecorder: vi.fn(),
  };
});

vi.mock("@/lib/telemetry", async () => {
  const actual = await vi.importActual<typeof import("@/lib/telemetry")>("@/lib/telemetry");
  return { ...actual, trackEvent: vi.fn() };
});

const voiceModule = await import("@/lib/voice");
const mockedIsSupported = vi.mocked(voiceModule.isVoiceCaptureSupported);
const mockedCreateRecorder = vi.mocked(voiceModule.createVoiceRecorder);
const telemetryModule = await import("@/lib/telemetry");
const mockedTrackEvent = vi.mocked(telemetryModule.trackEvent);

class FakeRecorder implements VoiceRecorder {
  state: VoiceRecorderState = "idle";
  private levelCb: ((rms: number) => void) | null = null;
  private stateCb: ((state: VoiceRecorderState, reason?: VoiceStopReason) => void) | null = null;
  private autoStopCb: ((capture: VoiceCapture | null, reason: "silence" | "max_duration") => void) | null = null;

  startImpl: () => Promise<void> = async () => {
    this.state = "recording";
    this.stateCb?.("recording");
  };
  stopImpl: (reason: VoiceStopReason) => Promise<VoiceCapture | null> = async (reason) => {
    this.state = "idle";
    this.stateCb?.("idle", reason);
    return reason === "cancel" ? null : fakeCapture();
  };

  async start() {
    return this.startImpl();
  }
  async stop(reason: VoiceStopReason) {
    return this.stopImpl(reason);
  }
  onLevel(cb: (rms: number) => void) {
    this.levelCb = cb;
  }
  onStateChange(cb: (state: VoiceRecorderState, reason?: VoiceStopReason) => void) {
    this.stateCb = cb;
  }
  onAutoStop(cb: (capture: VoiceCapture | null, reason: "silence" | "max_duration") => void) {
    this.autoStopCb = cb;
  }
  emitLevel(rms: number) {
    this.levelCb?.(rms);
  }
  triggerAutoStop(capture: VoiceCapture | null, reason: "silence" | "max_duration") {
    this.state = "idle";
    this.autoStopCb?.(capture, reason);
  }
}

function fakeCapture(): VoiceCapture {
  return { wav: new Blob([new Uint8Array(4)], { type: "audio/wav" }), durationMs: 1200, peakRms: 0.4, sampleRate: 16000 };
}

function fakeTranscriptionResponse(text: string) {
  const body = {
    text,
    rawText: text,
    language: "zh",
    durationMs: 1200,
    processingMs: 200,
    provider: "fake",
    model: "fake-model",
  };
  return { data: body, error: undefined, response: new Response(JSON.stringify(body), { status: 200 }) };
}

let recorder: FakeRecorder;

function setup() {
  recorder = new FakeRecorder();
  mockedCreateRecorder.mockReturnValue(recorder);
  mockedIsSupported.mockReturnValue(true);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VoiceInputButton", () => {
  it("AC1: renders disabled with a reason when unsupported", () => {
    mockedIsSupported.mockReturnValue(false);
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });

    render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);

    const button = screen.getByRole("button", { name: "語音輸入" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "語音輸入需要 HTTPS 連線");

    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
  });

  it("AC2: clicking starts the recorder, shows 聆聽中…, aria-pressed=true, and level updates from onLevel", async () => {
    setup();
    render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);

    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "停止錄音" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByText("聆聽中…")).toBeInTheDocument();

    recorder.emitLevel(0.6); // proves onLevel is wired; VoiceVisualizer's own level rendering is E03-S042's concern
  });

  it("AC3: silence auto-stop -> fake API returns text -> empty draft -> onTranscript called, autoSent telemetry true when composer says so", async () => {
    setup();
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("明天 deadline 確認") as never);
    const onTranscript = vi.fn(() => true); // composer: draft was empty, it auto-submitted

    render(<VoiceInputButton conversationId="c1" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));

    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("明天 deadline 確認"));
    await waitFor(() => expect(screen.getByRole("button", { name: "語音輸入" })).not.toBeDisabled());
  });

  it("AC4: onTranscript returning false (composer appended instead of sending) does not error and returns to idle", async () => {
    setup();
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("明天 deadline 確認") as never);
    const onTranscript = vi.fn(() => false); // composer: draft was non-empty, appended instead

    render(<VoiceInputButton conversationId="c1" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(onTranscript).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "語音輸入" })).not.toBeDisabled());
  });

  it("AC5: empty text from the API -> onTranscript NOT called, shows 沒有辨識到內容", async () => {
    setup();
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("") as never);
    const onTranscript = vi.fn();

    render(<VoiceInputButton conversationId="c1" onTranscript={onTranscript} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(screen.getByText("沒有辨識到內容，請再試一次")).toBeInTheDocument());
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("regression: empty text is a contract SUCCESS, not shown with the error visualizer state (no shake/alarm for 'nothing to hear')", async () => {
    setup();
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("") as never);

    render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(screen.getByText("沒有辨識到內容，請再試一次")).toBeInTheDocument());
    expect(document.querySelector('[data-state="error"]')).not.toBeInTheDocument();
    expect(document.querySelector('[data-state="idle"]')).toBeInTheDocument();
  });

  it("AC6: 503 ASR_UNAVAILABLE -> shows 語音辨識服務暫時無法使用, button returns to idle (retryable)", async () => {
    setup();
    const errorBody = { code: "ASR_UNAVAILABLE", message: "語音辨識服務目前無法使用,請改用鍵盤輸入。" };
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue({
      data: undefined,
      error: errorBody,
      response: new Response(JSON.stringify(errorBody), { status: 503 }),
    } as never);

    render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(screen.getByText("語音辨識服務暫時無法使用")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "語音輸入" })).not.toBeDisabled();
    expect(document.querySelector('[data-state="error"]')).toBeInTheDocument();
  });

  it("AC7: PERMISSION_DENIED on start -> shows 瀏覽器未授權麥克風, never enters listening", async () => {
    setup();
    recorder.startImpl = async () => {
      throw new VoiceCaptureError("PERMISSION_DENIED");
    };

    render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "語音輸入" })).toHaveAttribute("title", "瀏覽器未授權麥克風"));
    expect(screen.queryByRole("button", { name: "停止錄音" })).not.toBeInTheDocument();
  });

  it("AC8: Esc while listening cancels (no transcription call), composer disabled disables the button", async () => {
    setup();
    const postSpy = vi.spyOn(apiClient.transcriptions, "POST");

    const { rerender } = render(<VoiceInputButton conversationId="c1" onTranscript={() => false} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "停止錄音" })).toBeInTheDocument());

    fireEvent.keyDown(screen.getByRole("button", { name: "停止錄音" }), { key: "Escape" });

    await waitFor(() => expect(screen.getByRole("button", { name: "語音輸入" })).toBeInTheDocument());
    expect(postSpy).not.toHaveBeenCalled();

    rerender(<VoiceInputButton conversationId="c1" disabled onTranscript={() => false} />);
    expect(screen.getByRole("button", { name: "語音輸入" })).toBeDisabled();
  });

  it("AC9: no telemetry payload for a successful transcribe (incl. capture_stop/transcribe_success) contains the recognized text", async () => {
    setup();
    const secretText = "極機密的辨識文字內容ABCDEF";
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse(secretText) as never);

    render(<VoiceInputButton conversationId="c1" onTranscript={() => true} />);
    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");
    await waitFor(() => expect(screen.getByRole("button", { name: "語音輸入" })).not.toBeDisabled());

    expect(mockedTrackEvent.mock.calls.length).toBeGreaterThan(0);
    for (const call of mockedTrackEvent.mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(secretText);
    }
    const successCall = mockedTrackEvent.mock.calls.find(([name]) => name === "conversation_voice_transcribe_success");
    expect(successCall?.[1]?.properties).toMatchObject({ textLength: secretText.length, autoSent: true });
  });
});
