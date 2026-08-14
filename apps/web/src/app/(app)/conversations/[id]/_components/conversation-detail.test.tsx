import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationDetail from "./conversation-detail";
import { deleteConversation, getConversation, setConversationMode } from "@/lib/conversations";
import { deleteMessagesForConversation, listMessages } from "@/lib/messages";
import { CurrentUserProvider } from "@/lib/session-context";

// E03-S025: DeleteConversation (rendered as part of this page) calls
// useRouter() — without a mock, Next.js's real hook throws outside an
// actual app router context. Stable object reference across renders,
// same reasoning as conversations/new/page.test.tsx's own mockRouter
// (see session-gate.test.tsx for why that stability matters).
const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/conversations", () => ({
  getConversation: vi.fn(),
  setConversationMode: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  archiveConversation: vi.fn(),
  unarchiveConversation: vi.fn(),
}));

vi.mock("@/lib/messages", () => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  deleteMessagesForConversation: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedGetConversation = vi.mocked(getConversation);
const mockedSetConversationMode = vi.mocked(setConversationMode);
const mockedDeleteConversation = vi.mocked(deleteConversation);
const mockedListMessages = vi.mocked(listMessages);
const mockedDeleteMessagesForConversation = vi.mocked(deleteMessagesForConversation);

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedSetConversationMode.mockReset();
  mockedDeleteConversation.mockReset();
  mockedListMessages.mockReset();
  mockedListMessages.mockResolvedValue({ ok: true, value: [] });
  mockedDeleteMessagesForConversation.mockReset();
  mockedDeleteMessagesForConversation.mockResolvedValue({ ok: true, value: undefined });
});

function renderDetailAs(id: string, roles: string[] = ["general_user"]) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <ConversationDetail id={id} />
    </CurrentUserProvider>,
  );
}

describe("ConversationDetail (E03-S002/S003/S004/S005/S006)", () => {
  it("shows a loading state before the conversation resolves", () => {
    mockedGetConversation.mockReturnValue(new Promise(() => {}));

    renderDetailAs("c1");

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the title, mode switch, and knowledge selector once loaded", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "advanced",
        knowledgeScopes: ["qna", "company"],
        model: "standard",
      },
    });

    renderDetailAs("c1");

    expect(await screen.findByRole("heading", { name: "測試對話", level: 1 })).toBeInTheDocument();
    // E03-S024: the heading comes from RenameConversation, wired in —
    // deeper rename behavior (edit/save/cancel/error) is covered in
    // rename-conversation.test.tsx's own dedicated describe block, not
    // duplicated here.
    expect(screen.getByRole("button", { name: "重新命名" })).toBeInTheDocument();
    // E03-S026: same reasoning — ArchiveConversation wired in, showing
    // "封存對話" since this fixture's conversation isn't archived;
    // deeper behavior covered in archive-conversation.test.tsx.
    expect(screen.getByRole("button", { name: "封存對話" })).toBeInTheDocument();
    // E03-S025: same reasoning — DeleteConversation wired in, deeper
    // behavior covered in delete-conversation.test.tsx.
    expect(screen.getByRole("button", { name: "刪除對話" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "對話模式" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "進階模式" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "知識來源" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "問答庫" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "公司知識庫" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "部門知識庫" })).not.toBeChecked();
    expect(await screen.findByLabelText("訊息")).toBeInTheDocument();
  });

  it("E03-S006: shows the message composer regardless of conversation mode", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "normal",
        knowledgeScopes: [],
        model: "standard",
      },
    });

    renderDetailAs("c1");

    expect(await screen.findByLabelText("訊息")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "送出" })).toBeDisabled();
  });

  it("E03-S005: does not show the model selector when the conversation is in normal mode", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "normal",
        knowledgeScopes: [],
        model: "standard",
      },
    });

    renderDetailAs("c1");

    await screen.findByRole("heading", { name: "測試對話", level: 1 });
    expect(screen.queryByRole("combobox", { name: "AI 模型" })).not.toBeInTheDocument();
  });

  it("E03-S005: shows the model selector with the current model when the conversation is in advanced mode", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "advanced",
        knowledgeScopes: [],
        model: "advanced-local",
      },
    });

    renderDetailAs("c1");

    expect(await screen.findByRole("combobox", { name: "AI 模型" })).toHaveValue("advanced-local");
  });

  it("E03-S005: shows the model selector after switching from normal to advanced mode", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "normal",
        knowledgeScopes: [],
        model: "standard",
      },
    });
    mockedSetConversationMode.mockResolvedValue({
      ok: true,
      value: {
        id: "c1",
        title: "測試對話",
        lastMessageAt: "2026-08-12T09:15:00.000Z",
        lastMessagePreview: "測試預覽",
        mode: "advanced",
        knowledgeScopes: [],
        model: "standard",
      },
    });

    renderDetailAs("c1");

    await screen.findByRole("heading", { name: "測試對話", level: 1 });
    expect(screen.queryByRole("combobox", { name: "AI 模型" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "進階模式" }));

    expect(await screen.findByRole("combobox", { name: "AI 模型" })).toHaveValue("standard");
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedGetConversation.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    renderDetailAs("c1");

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入對話。");
  });

  it("shows a distinct not-found state (not the generic error) when the id doesn't match anything", async () => {
    mockedGetConversation.mockResolvedValue({ ok: true, value: null });

    renderDetailAs("does-not-exist");

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
  });
});
