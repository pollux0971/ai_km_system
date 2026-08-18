import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { ANSWER_STATES, ANSWER_STATE_FALLBACK_CONTENT, ANSWER_STATE_LABELS, MOCK_ANSWER_STATE_TRIGGERS } from "@/lib/answer-state";
import { MOCK_FILE_PROCESSING_FAILURE_TRIGGER, simulateFileProcessing } from "@/lib/file-processing";
import { runGenerationPhases } from "@/lib/generation-status";
import {
  listMessages,
  receiveAssistantReply,
  reviseMessage,
  sendMessage,
  submitAnswerFeedback,
  submitCitationFeedback,
  submitFeedbackComment,
  submitFeedbackReason,
  type AnswerFeedbackVerdict,
  type FeedbackReason,
} from "@/lib/messages";
import { shouldSimulateStreamDisconnect, streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  receiveAssistantReply: vi.fn(),
  reviseMessage: vi.fn(),
  submitAnswerFeedback: vi.fn(),
  submitCitationFeedback: vi.fn(),
  submitFeedbackReason: vi.fn(),
  submitFeedbackComment: vi.fn(),
  // Plain data, not vi.fn() — mirrors this file's established convention
  // (see the generation-status mock's own doc comment) of duplicating
  // inert constant/label values rather than vi.importActual'ing them.
  FEEDBACK_REASONS: ["INCORRECT", "INCOMPLETE", "OFF_TOPIC", "OTHER"],
  FEEDBACK_REASON_LABELS: {
    INCORRECT: "答案不正確",
    INCOMPLETE: "答案不完整",
    OFF_TOPIC: "答案離題",
    OTHER: "其他",
  },
  MAX_FEEDBACK_COMMENT_LENGTH: 500,
}));

vi.mock("@/lib/streaming", () => ({
  streamAssistantReply: vi.fn(),
  // E03-S031: real implementation is `userQuestion.includes(...)` — a
  // pure, deterministic, harmless function, but mocked anyway (not
  // vi.importActual'd) to match this file's established convention of
  // never importing real implementations into its mocks. Every
  // pre-S031 test sends plain trigger-free content, so a default of
  // "never disconnect" keeps them all passing unchanged; the new S031
  // tests below override it explicitly.
  shouldSimulateStreamDisconnect: vi.fn().mockReturnValue(false),
}));

// Same reasoning as the generation-status mock above: a plain
// synchronous factory, value duplicated rather than vi.importActual'd.
// Only simulateFileProcessing (which has a real 800ms default delay)
// needs faking — the trigger string itself is inert data.
vi.mock("@/lib/file-processing", () => ({
  MOCK_FILE_PROCESSING_FAILURE_TRIGGER: "[模擬:PROCESSING_FAILED]",
  simulateFileProcessing: vi.fn(),
}));

// message-thread.tsx only reads GENERATION_PHASE_LABELS (for rendering)
// and runGenerationPhases (to call) from this module — not
// GENERATION_PHASES — so the mock only needs to provide those two.
// Values duplicated (not vi.importActual'd) to keep this a plain
// synchronous factory, matching the other two mocks in this file.
vi.mock("@/lib/generation-status", () => ({
  GENERATION_PHASE_LABELS: {
    searching: "搜尋中…",
    reading: "讀取中…",
    generating: "生成中…",
  },
  runGenerationPhases: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedListMessages = vi.mocked(listMessages);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedReceiveAssistantReply = vi.mocked(receiveAssistantReply);
const mockedReviseMessage = vi.mocked(reviseMessage);
const mockedSubmitAnswerFeedback = vi.mocked(submitAnswerFeedback);
const mockedSubmitCitationFeedback = vi.mocked(submitCitationFeedback);
const mockedSubmitFeedbackReason = vi.mocked(submitFeedbackReason);
const mockedSubmitFeedbackComment = vi.mocked(submitFeedbackComment);
const mockedStreamAssistantReply = vi.mocked(streamAssistantReply);
const mockedShouldSimulateStreamDisconnect = vi.mocked(shouldSimulateStreamDisconnect);
const mockedRunGenerationPhases = vi.mocked(runGenerationPhases);
const mockedTrackEvent = vi.mocked(trackEvent);
const mockedSimulateFileProcessing = vi.mocked(simulateFileProcessing);

const DEFAULT_ASSISTANT_MESSAGE = {
  id: "assistant-default",
  conversationId: "c1",
  role: "assistant" as const,
  content: "（預設 mock 回覆，與送出測試無關）",
  attachmentNames: [],
  createdAt: "2026-08-14T00:00:00.000Z",
};

beforeEach(() => {
  mockedListMessages.mockReset();
  mockedSendMessage.mockReset();
  mockedReceiveAssistantReply.mockReset();
  mockedReviseMessage.mockReset();
  mockedStreamAssistantReply.mockReset();
  mockedRunGenerationPhases.mockReset();
  mockedTrackEvent.mockReset();
  mockedSimulateFileProcessing.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReset();
  mockedShouldSimulateStreamDisconnect.mockReturnValue(false);

  // Only reached when a submitted message actually has attachments —
  // every pre-S29 test uses submitViaComposer, which never attaches
  // files, so this default only matters for S29's own new tests below
  // (each of which overrides it explicitly anyway); it exists purely
  // so this mock always has SOME implementation rather than throwing
  // "not implemented" if a future test exercises this path without
  // configuring it first.
  mockedSimulateFileProcessing.mockResolvedValue("done");

  // Sensible defaults so tests focused purely on the S09/S10 send/stream
  // flow don't also need to know about S11's phase step — a successful
  // send always triggers streaming, which always runs the phase sequence
  // first, so every mockedSendMessage-succeeds test would otherwise
  // crash on an unmocked/unconfigured phase generator.
  mockedRunGenerationPhases.mockImplementation(async function* () {
    return;
  });
  mockedStreamAssistantReply.mockImplementation(async function* () {
    return;
  });
  mockedReceiveAssistantReply.mockResolvedValue({ ok: true, value: DEFAULT_ASSISTANT_MESSAGE });
  mockedReviseMessage.mockResolvedValue({ ok: true, value: DEFAULT_ASSISTANT_MESSAGE });
  mockedSubmitAnswerFeedback.mockReset();
  mockedSubmitCitationFeedback.mockReset();
  mockedSubmitFeedbackReason.mockReset();
  mockedSubmitFeedbackComment.mockReset();
});

function submitViaComposer(content: string) {
  fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

describe("MessageThread (E03-S009)", () => {
  it("shows a loading state before messages resolve", () => {
    mockedListMessages.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入訊息。");
  });

  it("shows an empty state when there are no messages yet", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("尚無訊息，開始對話吧。")).toBeInTheDocument();
  });

  it("shows previously-sent messages once loaded", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "保固期限是多久？",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("保固期限是多久？")).toBeInTheDocument();
  });

  it("optimistically shows a message as pending immediately on submit, then reconciles to sent", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    let resolveSend!: (value: Awaited<ReturnType<typeof sendMessage>>) => void;
    mockedSendMessage.mockReturnValue(new Promise((resolve) => (resolveSend = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("你好");

    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("傳送中…");

    resolveSend({
      ok: true,
      value: {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "你好",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    });

    await waitFor(() => expect(screen.queryByText("傳送中…")).not.toBeInTheDocument());
    expect(screen.getByText("你好")).toBeInTheDocument();
  });

  it("shows a failed message with a retry action when sending fails, and keeps the content visible", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("你好");

    expect(await screen.findByText("傳送失敗")).toBeInTheDocument();
    expect(screen.getByText("你好")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新傳送" })).toBeInTheDocument();
  });

  it("retrying a failed message re-attempts sendMessage with the same content and can succeed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("傳送失敗");

    mockedSendMessage.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "你好",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新傳送" }));

    await waitFor(() => expect(screen.queryByText("傳送失敗")).not.toBeInTheDocument());
    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
    expect(mockedSendMessage).toHaveBeenNthCalledWith(2, "c1", "你好", []);
  });

  it("calls sendMessage with the conversationId, content, and attachment names from the composer", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "你好",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:00.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", []));
  });
});

const SENT_USER_MESSAGE = {
  id: "m1",
  conversationId: "c1",
  role: "user" as const,
  content: "你好",
  attachmentNames: [],
  createdAt: "2026-08-14T00:00:00.000Z",
};

describe("MessageThread streaming assistant reply (E03-S010)", () => {
  it("automatically starts streaming an assistant reply once the user's message finishes sending", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(1));
  });

  it("shows the reply's content growing as chunks arrive, before the stream completes", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      await gate;
      yield "段";
    });
    mockedReceiveAssistantReply.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "第一段",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.getByText("第一")).toBeInTheDocument());
    expect(screen.getByRole("status", { name: "" })).toHaveTextContent("AI 回覆中…");

    releaseGate();

    // Once the gate releases, the generator yields its last chunk and
    // completes — the locally-accumulated text ("第一段") is what gets
    // persisted, proven directly (not just via what's re-displayed,
    // which depends on the mocked receiveAssistantReply's return value,
    // not on this component's own accumulation). 3rd arg "ANSWERED"
    // (E03-S021): "你好" contains no state trigger phrase.
    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一段", "ANSWERED"));
    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
  });

  it("reconciles a completed stream to a sent assistant message and persists the full accumulated content", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      yield "段";
    });
    mockedReceiveAssistantReply.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "第一段",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
    expect(screen.getByText("第一段")).toBeInTheDocument();
    // 3rd arg "ANSWERED" (E03-S021): "你好" contains no state trigger.
    expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一段", "ANSWERED");
  });

  it("shows a distinct failed state with a retry action when persisting the reply fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第一段";
    });
    mockedReceiveAssistantReply.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    expect(await screen.findByText("AI 回覆失敗")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新產生回覆" })).toBeInTheDocument();
  });

  it("retrying a failed stream re-attempts streamAssistantReply and can succeed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementationOnce(async function* () {
      yield "第一段";
    });
    mockedReceiveAssistantReply.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("AI 回覆失敗");

    mockedStreamAssistantReply.mockImplementationOnce(async function* () {
      yield "重試後的回覆";
    });
    mockedReceiveAssistantReply.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "重試後的回覆",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    await waitFor(() => expect(screen.queryByText("AI 回覆失敗")).not.toBeInTheDocument());
    expect(screen.getByText("重試後的回覆")).toBeInTheDocument();
    expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(2);
  });

  it("labels the user's own message and the assistant's reply distinctly", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一段",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    const items = await screen.findAllByRole("listitem");
    expect(items[0]).toHaveTextContent("你");
    expect(items[1]).toHaveTextContent("AI");
  });
});

describe("MessageThread generation status phases (E03-S011)", () => {
  it("shows each phase label in order (searching, then reading, then generating) before any reply text exists", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    let releaseSearching!: () => void;
    let releaseReading!: () => void;
    const searchingGate = new Promise<void>((resolve) => {
      releaseSearching = resolve;
    });
    const readingGate = new Promise<void>((resolve) => {
      releaseReading = resolve;
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await searchingGate;
      yield "reading";
      await readingGate;
      yield "generating";
    });
    // Left permanently pending — this test only cares about observing
    // the three phases in order, not what happens after. Without this,
    // once the phase generator exhausts, runStream immediately falls
    // through to the default (instantly-resolving) beforeEach mocks for
    // streamAssistantReply/receiveAssistantReply, and the whole flow
    // races to "sent" before waitFor can reliably catch the brief
    // "generating" window.
    mockedStreamAssistantReply.mockImplementation(async function* () {
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("搜尋中…"));

    releaseSearching();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("讀取中…"));

    releaseReading();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("生成中…"));
  });

  it("falls back to the generic streaming status once the phase sequence completes and real text starts arriving", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      yield "reading";
      yield "generating";
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆內容";
    });
    // Left permanently pending — this test checks the "actively
    // streaming text" state specifically. receiveAssistantReply's
    // default (beforeEach) mock resolves near-instantly with unrelated
    // content, which would otherwise race the reconciliation-to-"sent"
    // transition against the synchronous assertions below.
    mockedReceiveAssistantReply.mockImplementation(() => new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.getByText("回覆內容")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent("AI 回覆中…");
    expect(screen.queryByText("生成中…")).not.toBeInTheDocument();
  });

  it("runs the phase sequence again on retry after a stream failure", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedReceiveAssistantReply.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("AI 回覆失敗");

    expect(mockedRunGenerationPhases).toHaveBeenCalledTimes(1);
    mockedReceiveAssistantReply.mockResolvedValueOnce({ ok: true, value: DEFAULT_ASSISTANT_MESSAGE });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    await waitFor(() => expect(mockedRunGenerationPhases).toHaveBeenCalledTimes(2));
  });
});

describe("MessageThread stop generation (E03-S012)", () => {
  it("shows a stop button while a phase is showing", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.getByRole("button", { name: "停止生成" })).toBeInTheDocument());
  });

  it("stopping during the phase sequence (before any real content arrives) removes the entry and does not persist anything", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    // Gated (not eternally pending) — the loop only notices the stop
    // request once its currently in-flight `.next()` resolves, same as
    // the real generator (which is always waiting on a short timer, not
    // stuck forever). An eternally-pending mock would make the loop
    // unable to ever check the flag at all, which doesn't reflect how
    // stopping actually behaves in production.
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await gate;
      yield "reading";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByText("搜尋中…");

    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    releaseGate();

    await waitFor(() => expect(screen.queryByText("搜尋中…")).not.toBeInTheDocument());
    expect(screen.queryByText("讀取中…")).not.toBeInTheDocument();
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_stream_stopped",
      expect.objectContaining({ properties: expect.objectContaining({ hadContent: false }) }),
    );
  });

  it("stopping after some content has streamed in persists exactly that partial content and reconciles to sent", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第";
      yield "一";
      await gate;
      yield "段";
    });
    mockedReceiveAssistantReply.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "第一",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await waitFor(() => expect(screen.getByText("第一")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    releaseGate();

    // 3rd arg "ANSWERED" (E03-S021): "你好" contains no state trigger.
    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一", "ANSWERED"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "停止生成" })).not.toBeInTheDocument());
    expect(screen.getByText("第一")).toBeInTheDocument();
    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "conversation_message_stream_stopped",
      expect.objectContaining({ properties: expect.objectContaining({ hadContent: true }) }),
    );
  });

  it("does not show a stop button once a message has settled (sent, failed, or stream-failed)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    expect(screen.queryByRole("button", { name: "停止生成" })).not.toBeInTheDocument();
  });
});

describe("MessageThread citation badges (E03-S013)", () => {
  it("renders a citation badge once a streamed assistant reply containing a [N] marker settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "本季成長 12%[1]";
    });
    mockedReceiveAssistantReply.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "本季成長 12%[1]",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    await waitFor(() => expect(screen.queryByText("AI 回覆中…")).not.toBeInTheDocument());
    expect(screen.getByText("本季成長 12%")).toBeInTheDocument();
    expect(screen.getByRole("superscript")).toHaveTextContent("[1]");
  });

  it("shows citation badges on previously-sent assistant messages that contain [N] markers", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆[1]",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByRole("superscript")).toHaveTextContent("[1]");
  });

  it("does not render a citation badge for the user's own message, even if it contains a [N]-shaped substring", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "m1",
          conversationId: "c1",
          role: "user",
          content: "請看附錄 [1] 的說明",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:00.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("請看附錄 [1] 的說明");
    expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
  });
});

// Uses the REAL lib/citations.ts (not mocked) — proving the actual
// wiring end to end (click → state → CitationPreviewDrawer → real
// getCitationSource → real mock data → rendered), consistent with how
// this file already asserts on lib/streaming.ts's real MOCK_REPLY
// elsewhere rather than mocking every layer.
describe("MessageThread citation preview (E03-S014)", () => {
  function assistantMessageWithCitation() {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆[1]",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
  }

  it("clicking a citation badge opens the preview drawer showing that citation's source", async () => {
    assistantMessageWithCitation();

    render(<MessageThread conversationId="c1" />);
    await screen.findByRole("button", { name: "檢視引用來源 1" });

    expect(screen.queryByRole("region", { name: "引用來源預覽" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("region", { name: "引用來源預覽" })).toBeInTheDocument();
    expect(await screen.findByText("（模擬來源文件 1，尚未串接真正的知識庫）")).toBeInTheDocument();
  });

  it("closing the preview drawer removes it from the page", async () => {
    assistantMessageWithCitation();

    render(<MessageThread conversationId="c1" />);
    await screen.findByRole("button", { name: "檢視引用來源 1" });
    fireEvent.click(screen.getByRole("button", { name: "檢視引用來源 1" }));
    await screen.findByRole("region", { name: "引用來源預覽" });

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "引用來源預覽" })).not.toBeInTheDocument());
  });
});

describe("MessageThread multi-turn conversation (E03-S017)", () => {
  it("disables the composer's submit button while a message is pending (send in flight)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "下一句" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("disables the composer's submit button while an assistant reply is streaming", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByRole("button", { name: "停止生成" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "下一句" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("re-enables the composer's submit once the turn fully settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆內容";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "第二輪" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeEnabled();
  });

  it("sending a second full turn after the first settles shows all four messages in order", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u1", conversationId: "c1", role: "user", content: "第一輪", attachmentNames: [], createdAt: "2026-08-14T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u2", conversationId: "c1", role: "user", content: "第二輪", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
      });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆";
    });
    mockedReceiveAssistantReply
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "a1", conversationId: "c1", role: "assistant", content: "回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "a2", conversationId: "c1", role: "assistant", content: "回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("第一輪");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    submitViaComposer("第二輪");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(4);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("第一輪");
    expect(items[1]).toHaveTextContent("AI");
    expect(items[2]).toHaveTextContent("第二輪");
    expect(items[3]).toHaveTextContent("AI");
    expect(mockedSendMessage).toHaveBeenCalledTimes(2);
    expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(2);
  });

  it("a second turn's stop control only affects its own turn, leaving the first turn's already-settled reply untouched", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u1", conversationId: "c1", role: "user", content: "第一輪", attachmentNames: [], createdAt: "2026-08-14T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u2", conversationId: "c1", role: "user", content: "第二輪", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
      });
    // Gated (not eternally pending) — the loop only notices the stop
    // request once its currently in-flight `.next()` resolves, same as
    // established in the E03-S012 tests this mirrors. An eternally-
    // pending mock would make the loop unable to ever check the flag at
    // all, since the generator itself would never regain control to
    // yield/return past the pending await.
    let releaseTurn2Gate!: () => void;
    const turn2Gate = new Promise<void>((resolve) => {
      releaseTurn2Gate = resolve;
    });
    mockedStreamAssistantReply
      .mockImplementationOnce(async function* () {
        yield "第一輪回覆";
      })
      .mockImplementationOnce(async function* () {
        yield "第二輪";
        await turn2Gate;
        yield "不應該被看到的內容";
      });
    mockedReceiveAssistantReply.mockResolvedValueOnce({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("第一輪");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());

    submitViaComposer("第二輪");
    // Waits for "AI 回覆中…" rather than matching "第二輪" text directly,
    // since the latter would ambiguously match both turn 2's own user
    // message and the assistant's accumulating content. This is NOT
    // relying on "AI 回覆中…" being gated on content arrival — `phase`
    // starts `null` here too (the default empty runGenerationPhases
    // mock from beforeEach), so the text is already showing from entry
    // creation. It's reliable because this mock's first yield ("第二輪")
    // has no `await` before it, so it resolves on the same microtask
    // tick as the streaming entry's own creation — by the time this
    // assertion's polling observes the DOM, both updates have already
    // flushed, so accumulated content is genuinely "第二輪" by this point.
    await waitFor(() => expect(screen.getByText("AI 回覆中…")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    releaseTurn2Gate();

    await waitFor(() => expect(screen.queryByRole("button", { name: "停止生成" })).not.toBeInTheDocument());
    expect(screen.queryByText("不應該被看到的內容")).not.toBeInTheDocument();
    // Turn 1's own reply stays visible and unaffected — turn 2's stop
    // persists only ITS OWN accumulated content ("第二輪") as the second
    // receiveAssistantReply call, not turn 1's already-settled content.
    expect(screen.getByText("第一輪回覆")).toBeInTheDocument();
    // 3rd arg "ANSWERED" (E03-S021): neither "第一輪" nor "第二輪"
    // contains a state trigger phrase.
    expect(mockedReceiveAssistantReply).toHaveBeenNthCalledWith(2, "c1", "第二輪", "ANSWERED");
  });
});

describe("MessageThread conversation context indicator (E03-S018)", () => {
  it("does not show the indicator at all when there are no messages yet (EmptyState already says so)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("尚無訊息，開始對話吧。");
    expect(screen.queryByText("上下文：目前尚無先前訊息。")).not.toBeInTheDocument();
  });

  it("shows the indicator's own empty-context message once a first message is in flight, before it settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    // The list is no longer empty (it holds the optimistic pending
    // entry), so EmptyState is gone and the indicator's own "尚無先前
    // 訊息" is no longer a redundant duplicate — sentMessageCount is
    // still legitimately 0 since nothing has settled yet.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    expect(screen.getByText("上下文：目前尚無先前訊息。")).toBeInTheDocument();
  });

  it("shows the correct count for previously-sent messages loaded on mount", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    expect(await screen.findByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument();
  });

  it("does not count a still-pending or still-streaming entry toward the context count", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("傳送中…"));
    expect(screen.getByText("上下文：目前尚無先前訊息。")).toBeInTheDocument();
  });

  it("counts the user's own message once it settles, even while the assistant's reply is still streaming", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    // attemptSend reconciles the user's own message from pending to
    // sent BEFORE calling startStream() — so by the time any phase is
    // visible, the count is already 1 (the user's message), not 0 or 2
    // (the assistant's reply is still in flight, correctly excluded).
    await waitFor(() => expect(screen.getByText("搜尋中…")).toBeInTheDocument());
    expect(screen.getByText("上下文：包含 1 則先前訊息。")).toBeInTheDocument();
  });

  it("updates the count to 2 once a full turn (user + assistant) settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆內容";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("第一輪");

    await waitFor(() => expect(screen.getByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument());
  });

  it("updates the count to 4 after a second full turn settles", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u1", conversationId: "c1", role: "user", content: "第一輪", attachmentNames: [], createdAt: "2026-08-14T00:00:00.000Z" },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: { id: "u2", conversationId: "c1", role: "user", content: "第二輪", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
      });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "回覆";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("第一輪");
    await waitFor(() => expect(screen.getByText("上下文：包含 2 則先前訊息。")).toBeInTheDocument());

    submitViaComposer("第二輪");
    await waitFor(() => expect(screen.getByText("上下文：包含 4 則先前訊息。")).toBeInTheDocument());
  });
});

describe("MessageThread regenerate answer action (E03-S019)", () => {
  it("shows a 重新產生 button on the last settled assistant reply, but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    expect(screen.getAllByRole("button", { name: "重新產生" })).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("重新產生");
    expect(items[1]).toHaveTextContent("重新產生");
  });

  it("does not show 重新產生 on an earlier assistant reply once a newer turn exists — only the last entry gets it", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
        {
          id: "m2",
          conversationId: "c1",
          role: "user",
          content: "第二個問題",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:02.000Z",
        },
        {
          id: "a2",
          conversationId: "c1",
          role: "assistant",
          content: "第二輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:03.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "重新產生" })).toHaveLength(1);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).not.toHaveTextContent("重新產生");
    expect(items[3]).toHaveTextContent("重新產生");
  });

  it("clicking 重新產生 revises the old message in place and starts a fresh stream that replaces its content", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "新的回覆";
    });
    mockedReviseMessage.mockResolvedValue({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "新的回覆",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    // E03-S020: finalizes through reviseMessage (update-in-place, same
    // id "a1"), not receiveAssistantReply (which would mint a new row) —
    // this is what makes retaining the old content as a revision
    // possible at all (see messages.ts's reviseMessage doc comment).
    // E03-S021: the 3rd arg is "ANSWERED" — this fixture's "a1" has no
    // explicit `state`, so handleRegenerate's `originalMessage.state ??
    // "ANSWERED"` fallback applies (see the dedicated E03-S021 describe
    // block below for the case where an original state IS reused).
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledWith("a1", "新的回覆", "ANSWERED"));
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText("新的回覆")).toBeInTheDocument());
    // Exactly one user message + one (regenerated) assistant reply —
    // the old reply is genuinely replaced as the CURRENT content, not
    // left behind as a second top-level entry (Functional AC 5: no
    // undefined duplicate side effect).
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    // E03-S020: "舊的回覆" is retained, not gone — it now appears inside
    // the revision history rather than as the current reply.
    expect(screen.getByText("先前版本（1）")).toBeInTheDocument();
    expect(screen.getByText("舊的回覆")).toBeInTheDocument();
  });

  it("locks the composer while a regeneration is in flight, same as any other turn", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await new Promise<void>(() => {});
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(screen.getByText("搜尋中…")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: "不該送得出去" } });
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("E03-S020: stopping a regeneration before any content arrives restores the original reply unchanged", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    // Gated with a controllable Promise (not the default empty-generator
    // mock, and not an eternally-pending one either) — with the default,
    // the whole phase+stream sequence completes so fast that "streaming"
    // never reliably paints before settling; with an eternally-pending
    // await, the loop can never regain control to check the stop flag
    // at all. Both are the exact traps E03-S012's own evidence file
    // documents. Click stop, THEN release the gate, so the loop's
    // `.next()` finally resolves and notices the flag on its next check.
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    mockedRunGenerationPhases.mockImplementation(async function* () {
      yield "searching";
      await gate;
      yield "reading";
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "停止生成" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "停止生成" }));
    releaseGate();

    // Unlike S19 (where the old row was deleted up front, so an empty
    // stop lost the reply entirely), S20 never touches the original row
    // until reviseMessage() actually runs — so an empty stop simply
    // restores it exactly as it was: no revision was ever recorded, and
    // neither finalize path was called at all.
    await waitFor(() => expect(screen.getByText("舊的回覆")).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("先前版本", { exact: false })).not.toBeInTheDocument();
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    expect(mockedReviseMessage).not.toHaveBeenCalled();
  });
});

describe("MessageThread answer revision (E03-S020)", () => {
  it("shows no revision history for a reply that has never been regenerated", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "唯一版本",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("唯一版本");
    expect(screen.queryByText("先前版本", { exact: false })).not.toBeInTheDocument();
  });

  it("regenerating twice accumulates two revisions, shown oldest first", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本一",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply
      .mockImplementationOnce(async function* () {
        yield "版本二";
      })
      .mockImplementationOnce(async function* () {
        yield "版本三";
      });
    mockedReviseMessage
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本二",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          revisions: ["版本一"],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        value: {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "版本三",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          revisions: ["版本一", "版本二"],
        },
      });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("版本一");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByText("版本二")).toBeInTheDocument());
    expect(screen.getByText("先前版本（1）")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));
    await waitFor(() => expect(screen.getByText("版本三")).toBeInTheDocument());

    expect(screen.getByText("先前版本（2）")).toBeInTheDocument();
    // Oldest first — matches reviseMessage's append order (see
    // messages.test.ts's "accumulates multiple revisions in order").
    const details = screen.getByText("先前版本（2）").closest("details");
    if (!details) throw new Error("expected a <details> ancestor for the 先前版本 summary");
    expect(details).toHaveTextContent(/版本一[\s\S]*版本二/);
  });
});

describe("MessageThread answer state rendering (E03-S021)", () => {
  it("shows no state badge for a normal reply with no explicit state (undefined defaults to ANSWERED)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "已完成的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("已完成的回覆");
    // Not even ANSWERED's own label ("已回答") should render — the
    // common case looks exactly as it did before this story existed.
    for (const state of ANSWER_STATES) {
      expect(screen.queryByText(ANSWER_STATE_LABELS[state])).not.toBeInTheDocument();
    }
  });

  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED"))("renders the %s badge with the correct label and role", async (state) => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "回覆內容",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state,
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    const badge = await screen.findByText(ANSWER_STATE_LABELS[state]);
    if (state === "ERROR" || state === "PERMISSION_DENIED") {
      // Permanent, settled negative states use role="alert" — NOT
      // "status", which every E2E spec's waitForThreadToSettle helper
      // treats as "still busy" and would never see hit 0 again once a
      // reply settles into one of these two states.
      expect(badge).toHaveAttribute("role", "alert");
    } else {
      expect(badge).not.toHaveAttribute("role");
    }
  });

  it("classifies a sent message from its trigger phrase and persists that state via receiveAssistantReply", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    const trigger = MOCK_ANSWER_STATE_TRIGGERS.NO_EVIDENCE;
    expect(trigger).toBeDefined();
    if (!trigger) return;

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer(`保固期限是多久？ ${trigger}`);

    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalled());
    expect(mockedReceiveAssistantReply.mock.calls[0]?.[2]).toBe("NO_EVIDENCE");
  });

  it("classifies a sent message with no trigger phrase as ANSWERED", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer("保固期限是多久？");

    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalled());
    expect(mockedReceiveAssistantReply.mock.calls[0]?.[2]).toBe("ANSWERED");
  });

  it("regenerating reuses the original message's own state instead of reclassifying", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "PERMISSION_DENIED",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");

    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalled());
    // The click itself carries no new question text to reclassify from
    // — regenerating answers the same underlying question, so it keeps
    // the same mock classification "a1" already had.
    expect(mockedReviseMessage.mock.calls[0]?.[2]).toBe("PERMISSION_DENIED");
  });

  it("PARTIAL keeps the normal streamed reply content alongside its badge, unlike the other non-ANSWERED states", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    const trigger = MOCK_ANSWER_STATE_TRIGGERS.PARTIAL;
    expect(trigger).toBeDefined();
    if (!trigger) return;
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "這是真的串流內容";
    });
    // Echo back whatever content/state runStream actually finalizes
    // with — same as the real function would — rather than the
    // unrelated beforeEach default, so the FINAL settled render (not
    // just the transient streaming moment) reflects what was persisted.
    mockedReceiveAssistantReply.mockImplementation(async (_conversationId, content, state) => ({
      ok: true,
      value: { ...DEFAULT_ASSISTANT_MESSAGE, content, state },
    }));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");

    submitViaComposer(trigger);

    await waitFor(() => expect(screen.getByText("這是真的串流內容")).toBeInTheDocument());
    expect(screen.getByText("部分回答")).toBeInTheDocument();
    expect(mockedReceiveAssistantReply.mock.calls[0]?.[1]).toBe("這是真的串流內容");
  });

  it.each(ANSWER_STATES.filter((state) => state !== "ANSWERED" && state !== "PARTIAL"))(
    "%s replaces content with fixed fallback text without ever calling streamAssistantReply",
    async (state) => {
      mockedListMessages.mockResolvedValue({ ok: true, value: [] });
      mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
      const trigger = MOCK_ANSWER_STATE_TRIGGERS[state];
      expect(trigger).toBeDefined();
      if (!trigger) return;
      const fallbackContent = ANSWER_STATE_FALLBACK_CONTENT[state];
      expect(fallbackContent).toBeDefined();
      if (!fallbackContent) return;
      // Echo back whatever content/state runStream actually finalizes
      // with, same as the real function would — see the PARTIAL test
      // above for why the unrelated beforeEach default isn't enough
      // once the FINAL settled render (not just the transient
      // streaming moment) is what's being asserted on.
      mockedReceiveAssistantReply.mockImplementation(async (_conversationId, content, resultState) => ({
        ok: true,
        value: { ...DEFAULT_ASSISTANT_MESSAGE, content, state: resultState },
      }));

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("尚無訊息，開始對話吧。");

      submitViaComposer(trigger);

      await waitFor(() => expect(screen.getByText(fallbackContent)).toBeInTheDocument());
      expect(mockedStreamAssistantReply).not.toHaveBeenCalled();
      expect(mockedReceiveAssistantReply.mock.calls[0]?.[1]).toBe(fallbackContent);
    },
  );
});

describe("MessageThread copy answer action (E03-S027)", () => {
  // navigator.clipboard doesn't exist in jsdom by default — stubbed
  // locally to this describe block since no other section of this file
  // needs it. Restored in afterEach (independent review MINOR finding:
  // an un-torn-down Object.defineProperty stub only happened to be safe
  // by virtue of this being the LAST describe block in the file — a
  // block added after this one would silently inherit a faked
  // navigator.clipboard otherwise).
  const mockedWriteText = vi.fn();
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    mockedWriteText.mockReset();
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockedWriteText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("shows a 複製 button on every settled assistant reply (not just the last one), but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "複製" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("複製");
    expect(items[1]).toHaveTextContent("複製");
    expect(items[2]).not.toHaveTextContent("複製");
    expect(items[3]).toHaveTextContent("複製");
  });

  it("clicking 複製 writes that message's raw content (including citation markers, as plain text) to the clipboard and shows 已複製", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "本季成長 12%[1]，主要來自新客戶導入。",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText(/本季成長/);

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith("本季成長 12%[1]，主要來自新客戶導入。"));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
  });

  it("copying one message does not mark a different message's button as 已複製", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const copyButtons = screen.getAllByRole("button", { name: "複製" });
    fireEvent.click(copyButtons[0]!);

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith("第一輪回覆"));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
    // Exactly one 已複製 — the other assistant reply's button is untouched.
    expect(screen.getAllByRole("button", { name: "複製" })).toHaveLength(1);
  });

  it("已複製 automatically reverts back to 複製 after a short delay", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        ],
      });
      mockedWriteText.mockResolvedValue(undefined);

      render(<MessageThread conversationId="c1" />);
      await screen.findByText("第一輪回覆");

      fireEvent.click(screen.getByRole("button", { name: "複製" }));
      expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a distinct error message and keeps the 複製 label when the clipboard write fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedWriteText.mockRejectedValue(new Error("denied"));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("複製失敗，請手動選取複製。");
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已複製" })).not.toBeInTheDocument();
  });

  it("disables the button while the copy is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveWrite!: () => void;
    mockedWriteText.mockReturnValue(new Promise<void>((resolve) => (resolveWrite = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    expect(screen.getByRole("button", { name: "複製" })).toBeDisabled();

    resolveWrite();
    await waitFor(() => expect(screen.getByRole("button", { name: "已複製" })).not.toBeDisabled());
  });

  it("copying two different messages with out-of-order resolution shows each one's own correct final state (no cross-message race)", async () => {
    // Independent review MAJOR finding: an earlier version of this
    // story shared ONE feedback slot across every message, so message
    // B's write resolving BEFORE message A's (no ordering guarantee
    // exists for two independent async operations) let B's success
    // silently overwrite A's already-shown confirmation, and orphaned
    // per-click timeouts could clear an unrelated message's state.
    // copyStatuses/copyResetTimeoutsRef are now keyed by messageId
    // specifically to make that structurally impossible — this test
    // reproduces the exact out-of-order scenario the review found.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    let resolveA1!: () => void;
    let resolveA2!: () => void;
    mockedWriteText.mockImplementation((content: unknown) => {
      if (content === "第一輪回覆") return new Promise<void>((resolve) => (resolveA1 = resolve));
      return new Promise<void>((resolve) => (resolveA2 = resolve));
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.click(within(items[1]!).getByRole("button", { name: "複製" }));
    fireEvent.click(within(items[3]!).getByRole("button", { name: "複製" }));

    // a2 (clicked second) resolves FIRST.
    resolveA2();
    await waitFor(() => expect(within(items[3]!).getByRole("button", { name: "已複製" })).toBeInTheDocument());
    // a1 must still show its OWN in-flight pending state — untouched by
    // a2's unrelated success.
    expect(within(items[1]!).getByRole("button", { name: "複製" })).toBeDisabled();

    resolveA1();
    // Both now correctly show 已複製 at the same time — independent
    // slots, not one shared one that only ever reflects the latest click.
    await waitFor(() => expect(within(items[1]!).getByRole("button", { name: "已複製" })).toBeInTheDocument());
    expect(within(items[3]!).getByRole("button", { name: "已複製" })).toBeInTheDocument();
  });
});

describe("MessageThread answer OK feedback (E13-S001)", () => {
  it("shows a 有幫助 button on every settled assistant reply (not just the last one), but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "有幫助" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("有幫助");
    expect(items[1]).toHaveTextContent("有幫助");
    expect(items[2]).not.toHaveTextContent("有幫助");
    expect(items[3]).toHaveTextContent("有幫助");
  });

  it("clicking 有幫助 submits OK feedback for that message and shows 已回饋：有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    await waitFor(() => expect(mockedSubmitAnswerFeedback).toHaveBeenCalledWith("a1", "OK"));
    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "有幫助" })).not.toBeInTheDocument();
  });

  it("renders 已回饋：有幫助 immediately for a message that already has feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "有幫助" })).not.toBeInTheDocument();
  });

  it("disables the 已回饋：有幫助 button once feedback has been given, so it cannot be submitted again", async () => {
    // Independent review MAJOR finding: every other test in this
    // describe block that reaches the "已回饋：有幫助" label only
    // asserted the button's accessible name, never .toBeDisabled() —
    // an adversarial mutation removing the `entry.message.feedback ===
    // "OK"` half of message-thread.tsx's disabled condition (leaving
    // only the in-flight-pending half) passed all 91 pre-existing
    // tests unnoticed, meaning a real regression that lets an
    // already-given verdict be resubmitted had zero coverage. This
    // test closes that gap directly.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const feedbackButton = screen.getByRole("button", { name: "已回饋：有幫助" });
    expect(feedbackButton).toBeDisabled();

    fireEvent.click(feedbackButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("giving feedback on one message does not mark a different message as 已回饋：有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const feedbackButtons = screen.getAllByRole("button", { name: "有幫助" });
    fireEvent.click(feedbackButtons[0]!);

    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    // Exactly one 有幫助 button remains — the other assistant reply is untouched.
    expect(screen.getAllByRole("button", { name: "有幫助" })).toHaveLength(1);
  });

  it("disables the button while the feedback submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();

    resolveSubmit({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "OK" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument());
  });

  it("shows a distinct error message and keeps the 有幫助 button enabled (for retry) when submission fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：有幫助" })).not.toBeInTheDocument();
  });
});

describe("MessageThread answer NG feedback (E13-S002)", () => {
  it("shows a 沒有幫助 button alongside 有幫助 on every settled assistant reply, but not on the user's own message", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });

    render(<MessageThread conversationId="c1" />);

    await screen.findByText("第二輪回覆");
    expect(screen.getAllByRole("button", { name: "沒有幫助" })).toHaveLength(2);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).not.toHaveTextContent("沒有幫助");
    expect(items[1]).toHaveTextContent("沒有幫助");
    expect(items[2]).not.toHaveTextContent("沒有幫助");
    expect(items[3]).toHaveTextContent("沒有幫助");
  });

  it("clicking 沒有幫助 submits NG feedback for that message and shows 已回饋：沒有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    await waitFor(() => expect(mockedSubmitAnswerFeedback).toHaveBeenCalledWith("a1", "NG"));
    expect(await screen.findByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "沒有幫助" })).not.toBeInTheDocument();
  });

  it("renders 已回饋：沒有幫助 immediately for a message that already has NG feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "沒有幫助" })).not.toBeInTheDocument();
  });

  it("once OK feedback has been given, disables the 沒有幫助 button too — a verdict is a single choice, not two independent toggles", async () => {
    // Design decision (documented in EVIDENCE): OK/NG share ONE
    // `Message.feedback` field, not two independent booleans, mirroring
    // SOURCE_BASELINE's golden flow "...→ OK / NG → Feedback Loop"
    // (a single either/or judgment). Once either verdict is recorded,
    // BOTH buttons become permanently non-clickable — same "no undo
    // feedback" invariant E13-S001 already established for its own
    // button, just applied symmetrically now that a second button exists.
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "OK",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const ngButton = screen.getByRole("button", { name: "沒有幫助" });
    expect(ngButton).toBeDisabled();

    fireEvent.click(ngButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("once NG feedback has been given, disables the 有幫助 button too", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const okButton = screen.getByRole("button", { name: "有幫助" });
    expect(okButton).toBeDisabled();

    fireEvent.click(okButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("disables the 已回饋：沒有幫助 button once NG feedback has been given, so it cannot be submitted again", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "第一輪回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          feedback: "NG",
        },
      ],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    const feedbackButton = screen.getByRole("button", { name: "已回饋：沒有幫助" });
    expect(feedbackButton).toBeDisabled();

    fireEvent.click(feedbackButton);
    expect(mockedSubmitAnswerFeedback).not.toHaveBeenCalled();
  });

  it("giving NG feedback on one message does not mark a different message as 已回饋：沒有幫助", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        { id: "a2", conversationId: "c1", role: "assistant", content: "第二輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:03.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const feedbackButtons = screen.getAllByRole("button", { name: "沒有幫助" });
    fireEvent.click(feedbackButtons[0]!);

    await screen.findByRole("button", { name: "已回饋：沒有幫助" });
    const items = screen.getAllByRole("listitem");
    // a1's row: verdict recorded, both its buttons disabled (OK stays
    // labeled 有幫助 since NG — not OK — was given; NG flips to 已回饋).
    expect(within(items[1]!).getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(within(items[1]!).getByRole("button", { name: "已回饋：沒有幫助" })).toBeDisabled();
    // a2's row: completely untouched, both buttons still enabled.
    expect(within(items[3]!).getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(within(items[3]!).getByRole("button", { name: "沒有幫助" })).toBeEnabled();
  });

  it("disables both 有幫助 and 沒有幫助 while an NG submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    expect(screen.getByRole("button", { name: "沒有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();

    resolveSubmit({
      ok: true,
      value: { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z", feedback: "NG" },
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：沒有幫助" })).toBeInTheDocument());
  });

  it("shows a distinct error message and keeps both buttons enabled (for retry) when an NG submission fails", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" },
      ],
    });
    mockedSubmitAnswerFeedback.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "沒有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "沒有幫助" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：沒有幫助" })).not.toBeInTheDocument();
  });
});

describe("MessageThread feedback reason selector (E13-S003)", () => {
  const DEFAULT_NG_MESSAGE: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    attachmentNames: string[];
    createdAt: string;
    feedback: AnswerFeedbackVerdict;
    feedbackReason?: FeedbackReason;
  } = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "第一輪回覆",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
    feedback: "NG",
  };

  function ngMessage(overrides: Partial<typeof DEFAULT_NG_MESSAGE> = {}) {
    return { ...DEFAULT_NG_MESSAGE, ...overrides };
  }

  it("does not render a reason selector when no feedback has been given yet", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("為什麼沒有幫助？")).not.toBeInTheDocument();
  });

  it("does not render a reason selector when OK feedback was given", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, ngMessage({ feedback: "OK" })],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("為什麼沒有幫助？")).not.toBeInTheDocument();
  });

  it("renders a reason selector with 4 radio options once NG feedback has been given, and the submit button starts disabled", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("為什麼沒有幫助？")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeEnabled();
    expect(screen.getByRole("radio", { name: "其他" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();
  });

  it("enables the submit button once a reason is selected, and clicking it submits that reason", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: true, value: ngMessage({ feedbackReason: "INCORRECT" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案不正確" }));
    expect(screen.getByRole("button", { name: "送出原因" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    await waitFor(() => expect(mockedSubmitFeedbackReason).toHaveBeenCalledWith("a1", "INCORRECT"));
  });

  it("locks the whole selector (every radio + submit button disabled) and shows the chosen label once a reason has been recorded", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage({ feedbackReason: "OFF_TOPIC" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "其他" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();
    expect(screen.getByText("已選擇原因：答案離題")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeChecked();
  });

  it("clicking the already-disabled submit button after a reason is recorded does not call submitFeedbackReason again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage({ feedbackReason: "OTHER" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));
    expect(mockedSubmitFeedbackReason).not.toHaveBeenCalled();
  });

  it("disables all radios and the submit button while a reason submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitFeedbackReason>>) => void;
    mockedSubmitFeedbackReason.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案不完整" }));
    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    expect(screen.getByRole("radio", { name: "答案不完整" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "答案不正確" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeDisabled();

    resolveSubmit({ ok: true, value: ngMessage({ feedbackReason: "INCOMPLETE" }) });
    await waitFor(() => expect(screen.getByText("已選擇原因：答案不完整")).toBeInTheDocument());
  });

  it("shows a distinct error message and re-enables the selector (for retry) when a reason submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, ngMessage()] });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "只能為「沒有幫助」的回饋選擇原因。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("radio", { name: "答案離題" }));
    fireEvent.click(screen.getByRole("button", { name: "送出原因" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("原因送出失敗，請再試一次。");
    expect(screen.getByRole("radio", { name: "答案離題" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出原因" })).toBeEnabled();
    expect(screen.queryByText(/已選擇原因/)).not.toBeInTheDocument();
  });

  it("selecting/submitting a reason for one message does not affect a different message's selector", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        ngMessage({ id: "a1", content: "第一輪回覆" }),
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        ngMessage({ id: "a2", content: "第二輪回覆", createdAt: "2026-08-14T00:00:03.000Z" }),
      ],
    });
    mockedSubmitFeedbackReason.mockResolvedValue({ ok: true, value: ngMessage({ id: "a1", content: "第一輪回覆", feedbackReason: "INCORRECT" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.click(within(items[1]!).getByRole("radio", { name: "答案不正確" }));
    fireEvent.click(within(items[1]!).getByRole("button", { name: "送出原因" }));

    await waitFor(() => expect(within(items[1]!).getByText("已選擇原因：答案不正確")).toBeInTheDocument());
    // a2's selector: completely untouched, still fully interactive.
    expect(within(items[3]!).getByRole("radio", { name: "答案不正確" })).toBeEnabled();
    expect(within(items[3]!).queryByText(/已選擇原因/)).not.toBeInTheDocument();
  });
});

describe("MessageThread free-text feedback (E13-S004)", () => {
  const DEFAULT_OK_MESSAGE: {
    id: string;
    conversationId: string;
    role: "assistant";
    content: string;
    attachmentNames: string[];
    createdAt: string;
    feedback: AnswerFeedbackVerdict;
    feedbackComment?: string;
  } = {
    id: "a1",
    conversationId: "c1",
    role: "assistant",
    content: "第一輪回覆",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
    feedback: "OK",
  };

  function okMessage(overrides: Partial<typeof DEFAULT_OK_MESSAGE> = {}) {
    return { ...DEFAULT_OK_MESSAGE, ...overrides };
  }

  it("does not render a comment box when no feedback has been given yet", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [SENT_USER_MESSAGE, { id: "a1", conversationId: "c1", role: "assistant", content: "第一輪回覆", attachmentNames: [], createdAt: "2026-08-14T00:00:01.000Z" }],
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.queryByText("還有什麼想補充的嗎？")).not.toBeInTheDocument();
  });

  it("renders a comment box once OK feedback has been given, and the submit button starts disabled", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("還有什麼想補充的嗎？")).toBeInTheDocument();
    expect(screen.getByLabelText("留言")).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("renders a comment box once NG feedback has been given (not gated to OK-only)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedback: "NG" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByText("還有什麼想補充的嗎？")).toBeInTheDocument();
  });

  it("enables the submit button once non-whitespace text is typed, and clicking it submits that comment", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: true, value: okMessage({ feedbackComment: "這個答案很清楚" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "這個答案很清楚" } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    await waitFor(() => expect(mockedSubmitFeedbackComment).toHaveBeenCalledWith("a1", "這個答案很清楚"));
  });

  it("keeps the submit button disabled for whitespace-only text", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("keeps the submit button disabled for text exceeding MAX_FEEDBACK_COMMENT_LENGTH", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "a".repeat(501) } });
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
  });

  it("locks the comment box (textarea + submit button disabled) and shows the stored comment once one has been recorded", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedbackComment: "已經送出的留言" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    expect(screen.getByLabelText("留言")).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();
    expect(screen.getByText("已送出留言：已經送出的留言")).toBeInTheDocument();
  });

  it("clicking the already-disabled submit button after a comment is recorded does not call submitFeedbackComment again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage({ feedbackComment: "已經送出的留言" })] });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));
    expect(mockedSubmitFeedbackComment).not.toHaveBeenCalled();
  });

  it("disables the textarea and submit button while a comment submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitFeedbackComment>>) => void;
    mockedSubmitFeedbackComment.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "送出中的留言" } });
    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    expect(screen.getByLabelText("留言")).toBeDisabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeDisabled();

    resolveSubmit({ ok: true, value: okMessage({ feedbackComment: "送出中的留言" }) });
    await waitFor(() => expect(screen.getByText("已送出留言：送出中的留言")).toBeInTheDocument());
  });

  it("shows a distinct error message and re-enables the comment box (for retry) when a comment submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [SENT_USER_MESSAGE, okMessage()] });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "留言不得為空白。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第一輪回覆");

    fireEvent.change(screen.getByLabelText("留言"), { target: { value: "會失敗的留言" } });
    fireEvent.click(screen.getByRole("button", { name: "送出留言" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("留言送出失敗，請再試一次。");
    expect(screen.getByLabelText("留言")).toBeEnabled();
    expect(screen.getByRole("button", { name: "送出留言" })).toBeEnabled();
    expect(screen.queryByText(/已送出留言/)).not.toBeInTheDocument();
  });

  it("typing/submitting a comment for one message does not affect a different message's comment box", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        okMessage({ id: "a1", content: "第一輪回覆" }),
        { id: "m2", conversationId: "c1", role: "user", content: "第二個問題", attachmentNames: [], createdAt: "2026-08-14T00:00:02.000Z" },
        okMessage({ id: "a2", content: "第二輪回覆", createdAt: "2026-08-14T00:00:03.000Z" }),
      ],
    });
    mockedSubmitFeedbackComment.mockResolvedValue({ ok: true, value: okMessage({ id: "a1", content: "第一輪回覆", feedbackComment: "只給第一則的留言" }) });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("第二輪回覆");

    const items = screen.getAllByRole("listitem");
    fireEvent.change(within(items[1]!).getByLabelText("留言"), { target: { value: "只給第一則的留言" } });
    fireEvent.click(within(items[1]!).getByRole("button", { name: "送出留言" }));

    await waitFor(() => expect(within(items[1]!).getByText("已送出留言：只給第一則的留言")).toBeInTheDocument());
    // a2's comment box: completely untouched, still fully interactive.
    expect(within(items[3]!).getByLabelText("留言")).toBeEnabled();
    expect(within(items[3]!).queryByText(/已送出留言/)).not.toBeInTheDocument();
  });
});

// Uses the REAL lib/citations.ts (not mocked, same as the E03-S014
// citation preview block above) — getCitationSource("1")/("2") both
// resolve to real mock sources, so these tests exercise the actual
// click → drawer → feedback UI wiring end to end.
describe("MessageThread citation-specific feedback (E13-S005)", () => {
  const A1_TWO_CITATIONS = {
    id: "a1",
    conversationId: "c1",
    role: "assistant" as const,
    content: "本季成長 12%[1]，去年為 8%[2]",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
  };

  it("shows 此引用有幫助/此引用不準確 buttons in the preview drawer for a settled assistant message's citation", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "此引用不準確" })).toBeInTheDocument();
  });

  it("clicking 此引用有幫助 submits OK citation feedback for the correct (messageId, citationId) pair and shows 已回饋：此引用有幫助", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    await waitFor(() => expect(mockedSubmitCitationFeedback).toHaveBeenCalledWith("a1", "1", "OK"));
    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
  });

  it("renders 已回饋：此引用有幫助 immediately for a citation that already has feedback recorded (e.g. after reload)", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [{ ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } }] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "此引用有幫助" })).not.toBeInTheDocument();
  });

  it("disables BOTH citation feedback buttons once feedback has been given, so it cannot be submitted again", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [{ ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } }] });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));

    const givenButton = await screen.findByRole("button", { name: "已回饋：此引用有幫助" });
    const ngButton = screen.getByRole("button", { name: "此引用不準確" });
    expect(givenButton).toBeDisabled();
    expect(ngButton).toBeDisabled();

    fireEvent.click(givenButton);
    expect(mockedSubmitCitationFeedback).not.toHaveBeenCalled();
  });

  it("giving feedback on one citation does not mark a DIFFERENT citation within the SAME message as already-given", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));
    await screen.findByRole("button", { name: "已回饋：此引用有幫助" });

    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 2" }));

    // Citation "2" was never given feedback — still shows the un-given label, not "已回饋".
    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });

  it("giving feedback on a citation in one message does not affect the SAME citationId in a different message", async () => {
    const a1 = { ...A1_TWO_CITATIONS, id: "a1", content: "第一則回覆[1]" };
    const a2 = { ...A1_TWO_CITATIONS, id: "a2", content: "第二則回覆[1]" };
    mockedListMessages.mockResolvedValue({ ok: true, value: [a1, a2] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: true, value: { ...a1, citationFeedback: { "1": "OK" } } });

    render(<MessageThread conversationId="c1" />);
    const citationButtons = await screen.findAllByRole("button", { name: "檢視引用來源 1" });
    expect(citationButtons).toHaveLength(2);

    fireEvent.click(citationButtons[0]!); // a1's citation "1"
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));
    await screen.findByRole("button", { name: "已回饋：此引用有幫助" });
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));

    fireEvent.click(screen.getAllByRole("button", { name: "檢視引用來源 1" })[1]!); // a2's citation "1"
    expect(await screen.findByRole("button", { name: "此引用有幫助" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });

  it("disables the citation feedback buttons while the submission is in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    let resolveSubmit!: (value: Awaited<ReturnType<typeof submitCitationFeedback>>) => void;
    mockedSubmitCitationFeedback.mockReturnValue(new Promise((resolve) => (resolveSubmit = resolve)));

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "此引用不準確" })).toBeDisabled();

    resolveSubmit({ ok: true, value: { ...A1_TWO_CITATIONS, citationFeedback: { "1": "OK" } } });
    await waitFor(() => expect(screen.getByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument());
  });

  it("shows an error message and keeps buttons enabled (for retry) when the citation feedback submission fails", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_TWO_CITATIONS] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "找不到這個引用。" } });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");
    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "已回饋：此引用有幫助" })).not.toBeInTheDocument();
  });
});

/**
 * E13-S006 "feedback submission state" — see messages.test.ts's own
 * "feedback submission state composition" describe block for why this
 * story's scope is the CROSS-dimension composition proof, not a redo of
 * S001-S005's already-covered per-dimension pending/error/success states.
 * A message-level verdict submission and a citation feedback submission
 * are the one pair of dimensions that can genuinely be in flight at the
 * same time on the same message through the real UI (the reason
 * fieldset and comment textarea both only render once `feedback` is
 * already PERSISTED, not merely pending, so they can never overlap with
 * a still-pending verdict submission — see message-thread.tsx's own
 * gating conditions) — this is that composition proof.
 */
describe("MessageThread feedback submission state composition (E13-S006)", () => {
  const A1_ONE_CITATION = {
    id: "a1",
    conversationId: "c1",
    role: "assistant" as const,
    content: "本季成長 12%[1]",
    attachmentNames: [],
    createdAt: "2026-08-14T00:00:01.000Z",
  };

  it("a pending verdict submission and a pending citation feedback submission on the SAME message resolve independently, neither blocking the other's pending/disabled state", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_ONE_CITATION] });
    let resolveVerdict!: (value: Awaited<ReturnType<typeof submitAnswerFeedback>>) => void;
    let resolveCitation!: (value: Awaited<ReturnType<typeof submitCitationFeedback>>) => void;
    mockedSubmitAnswerFeedback.mockReturnValue(new Promise((resolve) => (resolveVerdict = resolve)));
    mockedSubmitCitationFeedback.mockReturnValue(new Promise((resolve) => (resolveCitation = resolve)));

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(screen.getByRole("button", { name: "有幫助" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    // Both submissions are in flight at once — both disabled, neither resolved yet.
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "此引用有幫助" })).toBeDisabled();

    // Resolve only the citation feedback — the still-pending verdict must be unaffected.
    resolveCitation({ ok: true, value: { ...A1_ONE_CITATION, citationFeedback: { "1": "OK" } } });
    expect(await screen.findByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "有幫助" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "已回饋：有幫助" })).not.toBeInTheDocument();

    // Now resolve the verdict too — it settles correctly, and the already-resolved
    // citation feedback (now persisted on the message) remains untouched.
    resolveVerdict({ ok: true, value: { ...A1_ONE_CITATION, feedback: "OK", citationFeedback: { "1": "OK" } } });
    expect(await screen.findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已回饋：此引用有幫助" })).toBeInTheDocument();
  });

  it("a citation feedback submission failure shows its own error only inside the drawer, leaving the message row's own verdict feedback error-free and still submittable", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [A1_ONE_CITATION] });
    mockedSubmitCitationFeedback.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "找不到這個引用。" } });
    mockedSubmitAnswerFeedback.mockResolvedValue({
      ok: true,
      value: { ...A1_ONE_CITATION, feedback: "OK" },
    });

    render(<MessageThread conversationId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: "檢視引用來源 1" }));
    fireEvent.click(await screen.findByRole("button", { name: "此引用有幫助" }));

    const drawer = await screen.findByRole("region", { name: "引用來源預覽" });
    expect(within(drawer).getByRole("alert")).toHaveTextContent("回饋送出失敗，請再試一次。");

    // The message row itself (outside the drawer) has no error alert of its own —
    // the citation feedback failure is scoped to the drawer, not leaked onto the
    // message-level verdict buttons' independent error-tracking state.
    const messageItem = screen.getByRole("listitem");
    expect(within(messageItem).queryByRole("alert")).not.toBeInTheDocument();

    fireEvent.click(within(messageItem).getByRole("button", { name: "有幫助" }));
    expect(await within(messageItem).findByRole("button", { name: "已回饋：有幫助" })).toBeInTheDocument();
  });
});

function submitViaComposerWithFile(content: string, fileName: string) {
  fireEvent.change(screen.getByLabelText("附件"), {
    target: { files: [new File(["x"], fileName, { type: "text/plain" })] },
  });
  if (content) {
    fireEvent.change(screen.getByLabelText("訊息"), { target: { value: content } });
  }
  fireEvent.click(screen.getByRole("button", { name: "送出" }));
}

describe("MessageThread file processing status (E03-S029)", () => {
  it("shows 檔案處理中… (not the generic 傳送中…) while an attached file is being processed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    expect(screen.getByRole("status")).toHaveTextContent("檔案處理中…");
    expect(screen.queryByText("傳送中…")).not.toBeInTheDocument();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("a message with no attachments still shows the generic 傳送中…, not 檔案處理中…, and never calls simulateFileProcessing", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    expect(screen.getByRole("status")).toHaveTextContent("傳送中…");
    expect(mockedSimulateFileProcessing).not.toHaveBeenCalled();
  });

  it("on successful processing, proceeds to call sendMessage and shows the message as sent with the attachment listed", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValue("done");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: { id: "m1", conversationId: "c1", role: "user", content: "你好", attachmentNames: ["報表.pdf"], createdAt: "2026-08-14T00:00:00.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", ["報表.pdf"]));
    expect(await screen.findByText("（附件：報表.pdf）")).toBeInTheDocument();
  });

  it("a filename containing the mock failure trigger shows 檔案處理失敗 with a 重新處理 button, and never calls sendMessage", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValue("failed");

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", `損毀${MOCK_FILE_PROCESSING_FAILURE_TRIGGER}.pdf`);

    expect(await screen.findByRole("alert")).toHaveTextContent("檔案處理失敗");
    expect(screen.getByRole("button", { name: "重新處理" })).toBeInTheDocument();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("clicking 重新處理 re-invokes file processing (not a cached prior result), and can proceed to send once it succeeds", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValueOnce("failed").mockResolvedValueOnce("done");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: { id: "m1", conversationId: "c1", role: "user", content: "你好", attachmentNames: ["a.pdf"], createdAt: "2026-08-14T00:00:00.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "a.pdf");
    await screen.findByRole("alert");
    expect(mockedSimulateFileProcessing).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新處理" }));

    await waitFor(() => expect(mockedSimulateFileProcessing).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("c1", "你好", ["a.pdf"]));
  });

  it("blocks a new turn from being submitted while file processing is still in flight", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockReturnValue(new Promise(() => {}));

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("emits file_processing attempt/success telemetry sharing one correlation id, distinct from the message-send events", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSimulateFileProcessing.mockResolvedValue("done");
    mockedSendMessage.mockResolvedValue({
      ok: true,
      value: { id: "m1", conversationId: "c1", role: "user", content: "你好", attachmentNames: ["報表.pdf"], createdAt: "2026-08-14T00:00:00.000Z" },
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposerWithFile("你好", "報表.pdf");

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_processing_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_processing_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);

    // The same correlationId also covers the subsequent
    // conversation_message_send_* events (one operation, one id) — not
    // re-asserted here since that pairing is already covered by other
    // describe blocks' own telemetry tests.
  });
});

describe("MessageThread no-evidence/abstention UX (E03-S030)", () => {
  // SOURCE_BASELINE.md's own line for this story (line 1251, inside «»
  // — this document's reserved verbatim-quotation marker) gives
  // NO_EVIDENCE's exact required display sentence, missed during
  // E03-S021 (which first introduced ANSWER_STATE_FALLBACK_CONTENT)
  // and corrected here after independent review caught the gap — see
  // lib/answer-state.ts's own doc comment for the full account. Beyond
  // that correction, E03-S021 already delivers this story's named
  // capability end-to-end (classification, fallback content, badge,
  // dedicated E2E coverage). Per
  // AI_KM_BMAD_High_Granularity/policies/ATOMIC_STORY_BOUNDARIES.md's
  // Scope Freeze section's explicit, unconditional prohibition on
  // "Developer 自己腦補需求 → 擴大 scope" (the AI Agent Rule's "不知道
  // 產品行為 → BLOCKED/ASSUMPTION" is related but actually permits a
  // self-adopted ASSUMPTION path — Scope Freeze is the decisive,
  // unconditional citation here), inventing new visible UI content
  // beyond what SOURCE_BASELINE actually specifies (a "try rephrasing"
  // suggestion, a link to a Knowledge Base page that doesn't exist yet
  // — E05 is 0/31 approved) would be exactly the self-invented product
  // behavior that section forbids. This
  // story's remaining increment is verifying two real interactions
  // between S21's abstention states and LATER features that didn't
  // exist yet when S21 shipped and were never cross-tested: citation
  // rendering (S13, predates S21) and Copy Answer (S27, postdates
  // S21). Full reasoning recorded via /advisor in docs/stories/E03-S030.md.
  const mockedWriteText = vi.fn();
  let originalClipboardDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    mockedWriteText.mockReset();
    originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockedWriteText },
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    if (originalClipboardDescriptor) {
      Object.defineProperty(navigator, "clipboard", originalClipboardDescriptor);
    } else {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it.each(ANSWER_STATES.filter((state) => ANSWER_STATE_FALLBACK_CONTENT[state] !== undefined))(
    "%s's fallback content never renders a citation badge, even though a normal ANSWERED reply's content always would",
    async (state) => {
      mockedListMessages.mockResolvedValue({
        ok: true,
        value: [
          SENT_USER_MESSAGE,
          {
            id: "a1",
            conversationId: "c1",
            role: "assistant",
            content: ANSWER_STATE_FALLBACK_CONTENT[state]!,
            attachmentNames: [],
            createdAt: "2026-08-14T00:00:01.000Z",
            state,
          },
        ],
      });

      render(<MessageThread conversationId="c1" />);

      await screen.findByText(ANSWER_STATE_LABELS[state]);
      // The fallback text itself never contains a literal `[N]`
      // substring (see answer-state.ts's own ANSWER_STATE_FALLBACK_CONTENT
      // doc comment) — asserting no <sup> citation marker rendered
      // proves message-content.tsx's regex-based parser genuinely finds
      // nothing to badge, not just that nobody happened to click one.
      expect(screen.queryByRole("superscript")).not.toBeInTheDocument();
    },
  );

  it("clicking 複製 on a NO_EVIDENCE reply copies its honest fallback text, not a fabricated real answer", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: ANSWER_STATE_FALLBACK_CONTENT.NO_EVIDENCE!,
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
          state: "NO_EVIDENCE",
        },
      ],
    });
    mockedWriteText.mockResolvedValue(undefined);

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("查無依據");

    fireEvent.click(screen.getByRole("button", { name: "複製" }));

    await waitFor(() => expect(mockedWriteText).toHaveBeenCalledWith(ANSWER_STATE_FALLBACK_CONTENT.NO_EVIDENCE));
    expect(await screen.findByRole("button", { name: "已複製" })).toBeInTheDocument();
  });
});

describe("MessageThread stream disconnect/reconnect UX (E03-S031)", () => {
  it("shows 連線中斷 and preserves the partial content already received when the stream disconnects mid-way", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedShouldSimulateStreamDisconnect.mockReturnValue(true);
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第一段";
      throw new Error("模擬串流中斷");
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");

    expect(await screen.findByText("第一段")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("連線中斷");
    expect(screen.getByRole("button", { name: "重新連線" })).toBeInTheDocument();
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
  });

  it("calls streamAssistantReply with the disconnect flag correctly wired: true when shouldSimulateStreamDisconnect says so, false otherwise", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      return;
    });

    mockedShouldSimulateStreamDisconnect.mockReturnValue(false);
    const { unmount } = render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await waitFor(() => expect(mockedStreamAssistantReply).toHaveBeenCalledWith(undefined, false));
    unmount();

    mockedStreamAssistantReply.mockReset();
    mockedStreamAssistantReply.mockImplementation(async function* () {
      throw new Error("模擬串流中斷");
    });
    mockedShouldSimulateStreamDisconnect.mockReturnValue(true);
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    // Content is arbitrary here — shouldSimulateStreamDisconnect is
    // mocked above to unconditionally return true, so the real trigger
    // string's presence/absence doesn't matter for this test's wiring
    // check (streaming.test.ts covers the real classification itself).
    submitViaComposer("你好");
    await waitFor(() => expect(mockedStreamAssistantReply).toHaveBeenCalledWith(undefined, true));
  });

  it("clicking 重新連線 restarts the stream from scratch and, once it succeeds, finalizes with the ORIGINAL answerState rather than defaulting to ANSWERED", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedShouldSimulateStreamDisconnect.mockReturnValue(true);
    mockedStreamAssistantReply.mockImplementationOnce(async function* () {
      yield "第一段";
      throw new Error("模擬串流中斷");
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    // "PARTIAL" trigger (E03-S021) so this test also confirms reconnect
    // finalizes with the SAME non-default state, not silently ANSWERED.
    submitViaComposer(`你好 ${MOCK_ANSWER_STATE_TRIGGERS.PARTIAL}`);
    await screen.findByRole("alert");

    mockedStreamAssistantReply.mockImplementationOnce(async function* () {
      yield "重新連線後的完整回覆";
    });
    mockedReceiveAssistantReply.mockResolvedValue({ ok: true, value: { ...DEFAULT_ASSISTANT_MESSAGE, content: "重新連線後的完整回覆", state: "PARTIAL" } });

    fireEvent.click(screen.getByRole("button", { name: "重新連線" }));

    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "重新連線後的完整回覆", "PARTIAL"));
    expect(await screen.findByText("重新連線後的完整回覆")).toBeInTheDocument();
  });

  it("reconnecting with the same persistent trigger deterministically disconnects again, not silently succeeding or getting stuck", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedShouldSimulateStreamDisconnect.mockReturnValue(true);
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "第一段";
      throw new Error("模擬串流中斷");
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "重新連線" }));

    await waitFor(() => expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("alert")).toHaveTextContent("連線中斷");
    expect(screen.getByRole("button", { name: "重新連線" })).toBeInTheDocument();
  });

  it("emits attempt and disconnected telemetry sharing one correlation id", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedShouldSimulateStreamDisconnect.mockReturnValue(true);
    mockedStreamAssistantReply.mockImplementation(async function* () {
      throw new Error("模擬串流中斷");
    });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer("你好");
    await screen.findByRole("alert");

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_message_stream_attempt");
    const disconnectedCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "conversation_message_stream_disconnected");
    expect(attemptCall).toBeDefined();
    expect(disconnectedCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const disconnectedId = (disconnectedCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(disconnectedId);
  });
});

describe("MessageThread message retry UX (E03-S032)", () => {
  it("retrying a stream-failed regenerate revises the same original message again — it does not fall through to creating a brand new one", async () => {
    mockedListMessages.mockResolvedValue({
      ok: true,
      value: [
        SENT_USER_MESSAGE,
        {
          id: "a1",
          conversationId: "c1",
          role: "assistant",
          content: "舊的回覆",
          attachmentNames: [],
          createdAt: "2026-08-14T00:00:01.000Z",
        },
      ],
    });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "重試前的內容";
    });
    mockedReviseMessage.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這則訊息。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("舊的回覆");
    fireEvent.click(screen.getByRole("button", { name: "重新產生" }));

    expect(await screen.findByText("AI 回覆失敗")).toBeInTheDocument();
    // The failed attempt already went through reviseMessage (not
    // receiveAssistantReply) — same finalize path the passing "重新產生
    // revises in place" test (E03-S020 above) asserts for the success
    // case; this is the failure-path counterpart of that same call.
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();

    mockedReviseMessage.mockResolvedValueOnce({
      ok: true,
      value: {
        id: "a1",
        conversationId: "c1",
        role: "assistant",
        content: "重試後的修訂",
        attachmentNames: [],
        createdAt: "2026-08-14T00:00:01.000Z",
        revisions: ["舊的回覆"],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    // A genuinely second call, updating the SAME message id "a1" again
    // — this is the actual bug this story fixes: without reviseTarget
    // threaded through handleRetryStream, this call would never happen
    // at all, and receiveAssistantReply would fire instead, minting a
    // brand new message rather than updating "a1".
    await waitFor(() => expect(mockedReviseMessage).toHaveBeenCalledTimes(2));
    expect(mockedReviseMessage.mock.calls[1]?.[0]).toBe("a1");
    expect(mockedReceiveAssistantReply).not.toHaveBeenCalled();
    expect(await screen.findByText("重試後的修訂")).toBeInTheDocument();
    // The `not.toHaveBeenCalled()`/call-count assertions above are what
    // actually prove no duplicate backend message was minted — this
    // listitem count is a supplementary sanity check, not independent
    // proof by itself: `displayMessages` always updates the SAME array
    // slot in place by localId regardless of which persistence function
    // fired, so the count alone would stay 2 even under the old buggy
    // behavior (it would just be 2 the wrong way, holding the newly
    // minted message's content instead of "a1"'s).
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("retrying a stream-failed NEW turn preserves its original non-ANSWERED classification instead of silently resetting to ANSWERED", async () => {
    mockedListMessages.mockResolvedValue({ ok: true, value: [] });
    mockedSendMessage.mockResolvedValue({ ok: true, value: SENT_USER_MESSAGE });
    mockedStreamAssistantReply.mockImplementation(async function* () {
      yield "部分回覆內容";
    });
    mockedReceiveAssistantReply.mockResolvedValueOnce({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });

    render(<MessageThread conversationId="c1" />);
    await screen.findByText("尚無訊息，開始對話吧。");
    submitViaComposer(`保固期限是多久？ ${MOCK_ANSWER_STATE_TRIGGERS.PARTIAL}`);

    expect(await screen.findByText("AI 回覆失敗")).toBeInTheDocument();

    mockedReceiveAssistantReply.mockResolvedValueOnce({
      ok: true,
      value: { ...DEFAULT_ASSISTANT_MESSAGE, content: "部分回覆內容", state: "PARTIAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新產生回覆" }));

    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledTimes(2));
    // The bug this fixes: without answerState threaded through the
    // retry, this 3rd arg would silently read "ANSWERED" instead,
    // regardless of what the original turn was actually classified as.
    expect(mockedReceiveAssistantReply.mock.calls[1]?.[2]).toBe("PARTIAL");
    // Genuinely re-streamed (not just replaying cached text) — same
    // "actually re-attempted" precedent the pre-existing S12 stream-
    // failed retry test already establishes.
    expect(mockedStreamAssistantReply).toHaveBeenCalledTimes(2);
  });
});
