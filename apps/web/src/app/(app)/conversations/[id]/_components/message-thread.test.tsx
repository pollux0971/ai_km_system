import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MessageThread } from "./message-thread";
import { listMessages, receiveAssistantReply, sendMessage } from "@/lib/messages";
import { streamAssistantReply } from "@/lib/streaming";

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  receiveAssistantReply: vi.fn(),
}));

vi.mock("@/lib/streaming", () => ({
  streamAssistantReply: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedListMessages = vi.mocked(listMessages);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedReceiveAssistantReply = vi.mocked(receiveAssistantReply);
const mockedStreamAssistantReply = vi.mocked(streamAssistantReply);

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

  // Sensible defaults so tests focused purely on the S09 send flow don't
  // also need to know about S10's streaming step — a successful send
  // always triggers it, so every mockedSendMessage-succeeds test would
  // otherwise crash on an unmocked/unconfigured streaming call.
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
