import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileChatEntryPage from "./page";
import { createConversation, deleteConversation } from "@/lib/conversations";
import { classifyFileProcessing } from "@/lib/file-processing";
import { sendMessage } from "@/lib/messages";
import { trackEvent } from "@/lib/telemetry";
import { CurrentUserProvider } from "@/lib/session-context";
import { recordUsageEvent } from "@/lib/usage-events";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  // Stable reference — see session-gate.test.tsx for why this matters.
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/conversations", () => ({
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock("@/lib/messages", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("@/lib/file-processing", () => ({
  classifyFileProcessing: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/usage-events", () => ({
  recordUsageEvent: vi.fn(),
}));

const mockedCreateConversation = vi.mocked(createConversation);
const mockedDeleteConversation = vi.mocked(deleteConversation);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedClassifyFileProcessing = vi.mocked(classifyFileProcessing);
const mockedTrackEvent = vi.mocked(trackEvent);
const mockedRecordUsageEvent = vi.mocked(recordUsageEvent);

const sampleConversation = {
  id: "new-1",
  title: "新對話",
  lastMessageAt: "2026-08-14T00:00:00.000Z",
  lastMessagePreview: "尚無訊息。",
  mode: "normal" as const,
  knowledgeScopes: [],
  model: "standard" as const,
};

const sampleMessage = {
  id: "m1",
  conversationId: "new-1",
  role: "user" as const,
  content: "",
  attachmentNames: ["報表.pdf"],
  createdAt: "2026-08-14T00:00:00.000Z",
};

function makeFile(name: string): File {
  return new File(["x"], name, { type: "text/plain" });
}

/**
 * E03-S028 determinism (2026-09-04): reproduces the live-FileList race
 * without relying on real render concurrency or repeat-each.
 *
 * A single fireEvent.change can't expose this bug: React 19's useState
 * dispatch computes the updater's result "eagerly", synchronously,
 * whenever the fiber has no update already pending (see
 * react-dom-client.development.js's dispatchSetStateInternal) — so
 * `Array.from(fileList)` runs at the exact same synchronous instant
 * whether it sits inside the updater (buggy) or is captured before it
 * (fixed), because it's the fiber's *first* pending update either way.
 * That eager path is exactly what let this bug hide behind a ~4%-flaky
 * e2e spec instead of showing up every run.
 *
 * Firing an ordinary selection first — still inside one act() batch —
 * gives the fiber a pending lane before the second, self-clearing
 * selection dispatches. That second dispatch's updater then genuinely
 * runs later (after the whole synchronous change event, including the
 * picker's own input.value reset, has already completed), which is
 * what "呼叫後立刻被清空的 live FileList 替身" is modelling: a fake
 * FileList (an ordinary mutable array) whose length is forced to 0 the
 * moment the input's value is reset, exactly like a real live FileList
 * being cleared in place.
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

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateConversation.mockReset();
  mockedDeleteConversation.mockReset();
  mockedSendMessage.mockReset();
  mockedClassifyFileProcessing.mockReset();
  mockedTrackEvent.mockReset();
  mockedRecordUsageEvent.mockReset();

  // E03-S029: every pre-existing test in this file selects an ordinary
  // filename and expects the create-then-attach flow to proceed — this
  // default keeps them passing unchanged; the one test that cares about
  // the failure path overrides it explicitly.
  mockedClassifyFileProcessing.mockReturnValue("done");
});

describe("FileChatEntryPage (E03-S028)", () => {
  it("disables 開始對話 until at least one file is selected", () => {
    render(<FileChatEntryPage />);

    expect(screen.getByRole("button", { name: "開始對話" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });

    expect(screen.getByRole("button", { name: "開始對話" })).not.toBeDisabled();
  });

  it("E03-S028 (determinism): keeps a file selected even when the browser clears its live FileList right after handing it off", () => {
    render(<FileChatEntryPage />);
    const input = screen.getByLabelText("附件") as HTMLInputElement;

    act(() => {
      selectFileWithLiveListClearedRightAfter(input, makeFile("a.pdf"), makeFile("b.pdf"));
    });

    // The decisive quantity: how many files actually ended up selected.
    // A regression to the pre-99d9bc2 shape loses "b.pdf" (the one whose
    // live FileList got cleared right after being handed to
    // handleFilesSelected), leaving only 1.
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "移除 b.pdf" })).toBeInTheDocument();
  });

  it("removing the only selected file disables 開始對話 again", () => {
    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    expect(screen.getByRole("button", { name: "開始對話" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "移除 報表.pdf" }));

    expect(screen.getByRole("button", { name: "開始對話" })).toBeDisabled();
  });

  it("creates a conversation, attaches the selected file(s), and redirects to the new conversation's own detail page", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("new-1", "", ["報表.pdf"]));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/conversations/new-1"));
    // Not the list route (E03-S001's own redirect target) — landing
    // directly inside the new conversation is the point of a file-first
    // entry.
    expect(mockReplace).not.toHaveBeenCalledWith("/conversations");
  });

  it("attaches multiple selected files together, excluding any that were removed before submitting", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), {
      target: { files: [makeFile("a.pdf"), makeFile("b.pdf"), makeFile("c.pdf")] },
    });
    fireEvent.click(screen.getByRole("button", { name: "移除 b.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockedSendMessage).toHaveBeenCalledWith("new-1", "", ["a.pdf", "c.pdf"]));
  });

  it("invalidates the router cache (refresh()) on success", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows a distinct error and does not call sendMessage or redirect when createConversation fails", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立新對話");
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("rolls back (deletes) the just-created conversation and shows an error when attaching the file fails, instead of leaving a file-less ghost conversation behind", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    mockedDeleteConversation.mockResolvedValue({ ok: true, value: undefined });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockedDeleteConversation).toHaveBeenCalledWith("new-1"));
    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立新對話");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("disables 開始對話 while the request is in flight, preventing a duplicate submit", async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof createConversation>>) => void;
    mockedCreateConversation.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    expect(screen.getByRole("button", { name: "開始對話" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("建立中…");
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);

    resolveCreate({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it("emits attempt and success telemetry sharing the same correlation id", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    const attemptCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_chat_entry_attempt");
    const successCall = mockedTrackEvent.mock.calls.find((call) => call[0] === "file_chat_entry_success");
    expect(attemptCall).toBeDefined();
    expect(successCall).toBeDefined();
    const attemptId = (attemptCall as [string, { correlationId: string }])[1].correlationId;
    const successId = (successCall as [string, { correlationId: string }])[1].correlationId;
    expect(attemptId).toBe(successId);
  });

  it("E03-S029: shows a distinct 檔案處理失敗 error and never calls createConversation when file processing fails", async () => {
    mockedClassifyFileProcessing.mockReturnValue("failed");

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("檔案處理失敗，請確認檔案後再試一次。");
    expect(mockedCreateConversation).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

describe("FileChatEntryPage usage event instrumentation (E13-S010)", () => {
  const SESSION = { userId: "u1", roles: ["general_user"], expiresAt: "2099-01-01T00:00:00.000Z" };

  it("records a conversation_created usage event for the current user once the whole flow (create + attach) succeeds", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(
      <CurrentUserProvider value={SESSION}>
        <FileChatEntryPage />
      </CurrentUserProvider>,
    );
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockedRecordUsageEvent).toHaveBeenCalledWith("conversation_created", "u1");
    expect(mockedRecordUsageEvent).toHaveBeenCalledTimes(1);
  });

  it("does not record a usage event when createConversation fails", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(
      <CurrentUserProvider value={SESSION}>
        <FileChatEntryPage />
      </CurrentUserProvider>,
    );
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await screen.findByRole("alert");
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();
  });

  it("does not record a usage event when the conversation is rolled back after a failed file attach (no event for a conversation that no longer exists)", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個對話。" } });
    mockedDeleteConversation.mockResolvedValue({ ok: true, value: undefined });

    render(
      <CurrentUserProvider value={SESSION}>
        <FileChatEntryPage />
      </CurrentUserProvider>,
    );
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockedDeleteConversation).toHaveBeenCalledWith("new-1"));
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();
  });

  it("does not record a usage event (and does not crash) when rendered outside a session provider", async () => {
    mockedCreateConversation.mockResolvedValue({ ok: true, value: sampleConversation });
    mockedSendMessage.mockResolvedValue({ ok: true, value: sampleMessage });

    render(<FileChatEntryPage />);
    fireEvent.change(screen.getByLabelText("附件"), { target: { files: [makeFile("報表.pdf")] } });
    fireEvent.click(screen.getByRole("button", { name: "開始對話" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(mockedRecordUsageEvent).not.toHaveBeenCalled();
  });
});
