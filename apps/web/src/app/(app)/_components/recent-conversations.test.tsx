import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RecentConversations from "./recent-conversations";
import { getRecentConversations } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  getRecentConversations: vi.fn(),
}));

const mockedGetRecentConversations = vi.mocked(getRecentConversations);

beforeEach(() => {
  mockedGetRecentConversations.mockReset();
});

describe("RecentConversations", () => {
  it("shows a loading state while the fetch is pending", () => {
    mockedGetRecentConversations.mockReturnValue(new Promise(() => {}));

    render(<RecentConversations />);

    expect(screen.getByRole("status")).toHaveTextContent("載入中…");
  });

  it("shows an error state distinct from empty when the fetch fails", async () => {
    mockedGetRecentConversations.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<RecentConversations />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入最近對話。");
    expect(screen.queryByText("尚無最近對話。")).not.toBeInTheDocument();
  });

  it("shows the empty state when the fetch succeeds with no conversations", async () => {
    mockedGetRecentConversations.mockResolvedValue({ ok: true, value: [] });

    render(<RecentConversations />);

    expect(await screen.findByText("尚無最近對話。")).toBeInTheDocument();
  });

  it("renders each conversation's title/preview and a link to view all", async () => {
    mockedGetRecentConversations.mockResolvedValue({
      ok: true,
      value: [
        {
          id: "c1",
          title: "測試對話標題",
          lastMessageAt: "2026-08-12T09:15:00.000Z",
          lastMessagePreview: "測試預覽內容",
          mode: "normal",
        },
      ],
    });

    render(<RecentConversations />);

    expect(await screen.findByText("測試對話標題")).toBeInTheDocument();
    expect(screen.getByText("測試預覽內容")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "查看全部對話" })).toHaveAttribute("href", "/conversations");
  });
});
