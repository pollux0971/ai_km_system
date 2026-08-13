import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ConversationList from "./conversation-list";
import { listConversations } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  listConversations: vi.fn(),
}));

const mockedListConversations = vi.mocked(listConversations);

describe("ConversationList (E03-S001)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListConversations.mockReturnValue(new Promise(() => {}));

    render(<ConversationList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each conversation's title, preview, and timestamp once loaded", async () => {
    mockedListConversations.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "c1",
          title: "測試對話",
          lastMessageAt: "2026-08-12T09:15:00.000Z",
          lastMessagePreview: "測試預覽",
          mode: "normal",
        },
      ],
    });

    render(<ConversationList />);

    expect(await screen.findByText("測試對話")).toBeInTheDocument();
    expect(screen.getByText("測試預覽")).toBeInTheDocument();
  });

  it("E03-S002: links each conversation's title to its detail route", async () => {
    mockedListConversations.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "c1",
          title: "測試對話",
          lastMessageAt: "2026-08-12T09:15:00.000Z",
          lastMessagePreview: "測試預覽",
          mode: "normal",
        },
      ],
    });

    render(<ConversationList />);

    expect(await screen.findByRole("link", { name: "測試對話" })).toHaveAttribute("href", "/conversations/c1");
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListConversations.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ConversationList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入對話列表。");
  });

  it("shows an empty state (not an error) when there are no conversations", async () => {
    mockedListConversations.mockResolvedValue({ ok: true, value: [] });

    render(<ConversationList />);

    expect(await screen.findByText("尚無對話，開始你的第一個對話。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
