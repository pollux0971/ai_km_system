import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageComposer } from "./message-composer";
import { trackEvent } from "@/lib/telemetry";
import { apiClient } from "@/lib/api";
import type {
  VoiceCapture,
  VoiceRecorder,
  VoiceRecorderState,
  VoiceStopReason,
} from "@/lib/voice";

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

// E03-S041: VoiceInputButton (rendered unconditionally by MessageComposer
// when the voice_input flag is on, the default) needs a controllable fake
// recorder for the new describe block below — see
// voice-input-button.test.tsx's top comment for the FakeRecorder shape and
// why apiClient.transcriptions.POST is spied on directly rather than
// routed through fake-api.ts (jsdom can't read a Blob out of a FormData
// body).
vi.mock("@/lib/voice", async () => {
  const actual = await vi.importActual<typeof import("@/lib/voice")>("@/lib/voice");
  return {
    ...actual,
    isVoiceCaptureSupported: vi.fn(() => true),
    createVoiceRecorder: vi.fn(),
  };
});

const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  mockedTrackEvent.mockReset();
});

function makeFile(name: string, sizeBytes: number): File {
  const file = new File(["x".repeat(Math.min(sizeBytes, 1))], name);
  Object.defineProperty(file, "size", { value: sizeBytes });
  return file;
}

/**
 * E03-S028 determinism (2026-09-04), same shape as new-file/page.test.tsx's
 * own helper — see that file's comment for why a single fireEvent.change
 * can't expose this race (React 19's useState dispatch eagerly evaluates
 * the updater synchronously whenever the fiber has no update already
 * pending, which happens to run Array.from(fileList) at the same instant
 * whether it's inside the updater or captured before it). Firing an
 * ordinary selection first, inside the same act() batch, gives the fiber
 * a pending lane so the second, self-clearing selection's updater
 * genuinely runs after the whole synchronous change event — including the
 * picker's own input.value reset — has completed.
 */
function selectFileWithLiveListClearedRightAfter(input: HTMLInputElement, firstFile: File, secondFile: File) {
  fireEvent.change(input, { target: { files: [firstFile] } });

  const selfClearingList = [secondFile];
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => "",
    set: () => {
      selfClearingList.length = 0;
    },
  });
  fireEvent.change(input, { target: { files: selfClearingList } });
}

describe("MessageComposer (E03-S006/S007/S008/S009)", () => {
  it("starts empty with the submit button disabled", () => {
    render(<MessageComposer conversationId="c1" />);

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("enables the submit button once non-whitespace text is entered", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("keeps the submit button disabled for whitespace-only input", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("clears the draft and emits telemetry (without the raw text) on submit", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 0 } }),
    );
    const [, payload] = mockedTrackEvent.mock.calls[0] as [string, { properties?: Record<string, unknown> }];
    expect(JSON.stringify(payload)).not.toContain("你好");
  });

  it("does not submit (no telemetry, draft unchanged) when bypassing the disabled button to submit an invalid draft", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("   ");
  });

  it("E03-S007: pressing Enter (without Shift) submits a valid draft, same as clicking 送出", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(screen.getByLabelText("訊息")).toHaveValue("");
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 0 } }),
    );
  });

  it("E03-S007: pressing Shift+Enter does not submit, leaving the draft for a newline instead", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: true });

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S007: pressing Enter (without Shift) on an empty draft does not submit", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S007: pressing Enter (without Shift) on a whitespace-only draft does not submit", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "   " } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(mockedTrackEvent).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("   ");
  });

  it("E03-S008: enables submit once a file is attached, even with no text", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("E03-S008: lists the attached file", () => {
    render(<MessageComposer conversationId="c1" />);

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf", 10)] } });

    expect(screen.getByRole("listitem")).toHaveTextContent("報表.pdf");
  });

  it("E03-S028 (determinism): keeps an attachment even when the browser clears its live FileList right after handing it off", () => {
    render(<MessageComposer conversationId="c1" />);
    const input = screen.getByLabelText("附件") as HTMLInputElement;

    act(() => {
      selectFileWithLiveListClearedRightAfter(input, makeFile("a.txt", 10), makeFile("b.txt", 10));
    });

    // The decisive quantity: how many attachments actually ended up
    // selected. A regression loses "b.txt" (the one whose live FileList
    // got cleared right after being handed to handleFilesSelected).
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "移除 b.txt" })).toBeInTheDocument();
  });

  it("E03-S008: submitting an attachment-only draft clears the attachment and reports attachmentCount, without any filename", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("機密文件.docx", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(screen.queryByText(/機密文件\.docx/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 0, attachmentCount: 1 } }),
    );
    const [, payload] = mockedTrackEvent.mock.calls[0] as [string, { properties?: Record<string, unknown> }];
    expect(JSON.stringify(payload)).not.toContain("機密文件");
  });

  it("E03-S008: submitting with both text and an attachment reports both in one event", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10), makeFile("b.txt", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: { conversationId: "c1", length: 2, attachmentCount: 2 } }),
    );
  });

  it("E03-S008: removing the only attachment (with no text) disables submit again", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "移除 a.txt" }));

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
    expect(screen.queryByText(/a\.txt/)).not.toBeInTheDocument();
  });

  it("E03-S009: calls onSubmit with the trimmed content and attachment names once a valid draft is submitted", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "  你好  " } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    fireEvent.click(screen.getByRole("button", { name: "送出" }));

    expect(onSubmit).toHaveBeenCalledWith("你好", ["a.txt"]);
  });

  it("E03-S009: does not call onSubmit when bypassing the disabled button to submit an invalid draft", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("E03-S009: still works without an onSubmit prop (optional, backward compatible with S06-S08)", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(() => fireEvent.click(screen.getByRole("button", { name: "送出" }))).not.toThrow();
    expect(screen.getByLabelText("訊息")).toHaveValue("");
  });

  it("E03-S017: defaults disabled to false — pre-S017 behavior (submit enabled once valid) is unchanged", () => {
    render(<MessageComposer conversationId="c1" />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("E03-S017: disabled=true keeps submit disabled even with an otherwise-valid draft", () => {
    render(<MessageComposer conversationId="c1" disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("E03-S017: disabled=true still lets the user type and attach files ahead — only sending is blocked", () => {
    render(<MessageComposer conversationId="c1" disabled={true} />);

    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("a.txt", 10)] } });

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(screen.getByRole("listitem")).toHaveTextContent("a.txt");
  });

  it("E03-S017: pressing Enter does not submit while disabled=true, even with a valid draft", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    fireEvent.keyDown(screen.getByLabelText("訊息"), { key: "Enter", shiftKey: false });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
  });

  it("E03-S017: does not call onSubmit when bypassing the disabled button via direct form submit while disabled=true", () => {
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });

    const form = screen.getByRole("button", { name: "送出" }).closest("form");
    fireEvent.submit(form as HTMLFormElement);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(mockedTrackEvent).not.toHaveBeenCalled();
  });

  it("E03-S017: re-enables submit once disabled flips back to false, without losing the draft", () => {
    const { rerender } = render(<MessageComposer conversationId="c1" disabled={true} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "你好" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();

    rerender(<MessageComposer conversationId="c1" disabled={false} />);

    expect(screen.getByLabelText("訊息")).toHaveValue("你好");
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });
});

// ---- E03-S041: voice input integration (auto-submit / append rule) ------------------

class FakeRecorder implements VoiceRecorder {
  state: VoiceRecorderState = "idle";
  private stateCb: ((state: VoiceRecorderState, reason?: VoiceStopReason) => void) | null = null;
  private autoStopCb: ((capture: VoiceCapture | null, reason: "silence" | "max_duration") => void) | null = null;

  async start() {
    this.state = "recording";
    this.stateCb?.("recording");
  }
  async stop(reason: VoiceStopReason) {
    this.state = "idle";
    this.stateCb?.("idle", reason);
    return reason === "cancel" ? null : fakeCapture();
  }
  onLevel() {}
  onStateChange(cb: (state: VoiceRecorderState, reason?: VoiceStopReason) => void) {
    this.stateCb = cb;
  }
  onAutoStop(cb: (capture: VoiceCapture | null, reason: "silence" | "max_duration") => void) {
    this.autoStopCb = cb;
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

describe("MessageComposer (E03-S041 voice input)", () => {
  let recorder: FakeRecorder;

  beforeEach(async () => {
    recorder = new FakeRecorder();
    const voiceModule = await import("@/lib/voice");
    vi.mocked(voiceModule.createVoiceRecorder).mockReturnValue(recorder);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC3: recognized text + empty draft -> auto-submits via the same submitDraftWith pipeline as typed Enter/送出 (telemetry + onSubmit)", async () => {
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("明天 deadline 確認") as never);
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);
    expect(screen.getByLabelText("訊息")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("明天 deadline 確認", []));
    expect(screen.getByLabelText("訊息")).toHaveValue(""); // cleared, same as a typed submit
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_compose_submit",
      expect.objectContaining({ properties: expect.objectContaining({ length: "明天 deadline 確認".length }) }),
    );
  });

  it("regression: non-empty draft is NOT auto-sent — recognized text is appended and requires manual confirmation (permanent, per Test Obligations)", async () => {
    vi.spyOn(apiClient.transcriptions, "POST").mockResolvedValue(fakeTranscriptionResponse("明天 deadline 確認") as never);
    const onSubmit = vi.fn();
    render(<MessageComposer conversationId="c1" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "先說結論" } });

    fireEvent.click(screen.getByRole("button", { name: "語音輸入" }));
    await waitFor(() => expect(recorder.state).toBe("recording"));
    recorder.triggerAutoStop(fakeCapture(), "silence");

    await waitFor(() => expect(screen.getByLabelText("訊息")).toHaveValue("先說結論 明天 deadline 確認"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("已加入語音文字，請確認後送出")).toBeInTheDocument();
    expect(screen.getByLabelText("訊息")).toHaveFocus();
  });

  it("AC1: voice_input flag off -> the button is not rendered at all", () => {
    vi.stubEnv("NEXT_PUBLIC_FEATURE_VOICE_INPUT", "false");
    render(<MessageComposer conversationId="c1" />);

    expect(screen.queryByRole("button", { name: "語音輸入" })).not.toBeInTheDocument();

    vi.unstubAllEnvs();
  });

  it("composer disabled=true disables the voice button too", () => {
    render(<MessageComposer conversationId="c1" disabled />);
    expect(screen.getByRole("button", { name: "語音輸入" })).toBeDisabled();
  });
});
