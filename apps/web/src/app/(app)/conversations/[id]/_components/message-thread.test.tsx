import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { ANSWER_STATES, ANSWER_STATE_FALLBACK_CONTENT, ANSWER_STATE_LABELS, MOCK_ANSWER_STATE_TRIGGERS } from "@/lib/answer-state";
import { runGenerationPhases } from "@/lib/generation-status";
import { listMessages, receiveAssistantReply, reviseMessage, sendMessage } from "@/lib/messages";
import { streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  receiveAssistantReply: vi.fn(),
  reviseMessage: vi.fn(),
}));

vi.mock("@/lib/streaming", () => ({
  streamAssistantReply: vi.fn(),
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
const mockedStreamAssistantReply = vi.mocked(streamAssistantReply);
const mockedRunGenerationPhases = vi.mocked(runGenerationPhases);
const mockedTrackEvent = vi.mocked(trackEvent);

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
