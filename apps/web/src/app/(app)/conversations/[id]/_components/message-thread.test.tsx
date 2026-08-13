import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { runGenerationPhases } from "@/lib/generation-status";
import { listMessages, receiveAssistantReply, sendMessage } from "@/lib/messages";
import { streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  receiveAssistantReply: vi.fn(),
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
    // not on this component's own accumulation).
    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一段"));
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
    expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一段");
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

    await waitFor(() => expect(mockedReceiveAssistantReply).toHaveBeenCalledWith("c1", "第一"));
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
