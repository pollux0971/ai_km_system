import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import FileChatEntryPage from "./page";
import { createConversation, deleteConversation } from "@/lib/conversations";
import { classifyFileProcessing } from "@/lib/file-processing";
import { sendMessage } from "@/lib/messages";
import { trackEvent } from "@/lib/telemetry";

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

const mockedCreateConversation = vi.mocked(createConversation);
const mockedDeleteConversation = vi.mocked(deleteConversation);
const mockedSendMessage = vi.mocked(sendMessage);
const mockedClassifyFileProcessing = vi.mocked(classifyFileProcessing);
const mockedTrackEvent = vi.mocked(trackEvent);

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

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateConversation.mockReset();
  mockedDeleteConversation.mockReset();
  mockedSendMessage.mockReset();
  mockedClassifyFileProcessing.mockReset();
  mockedTrackEvent.mockReset();

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
