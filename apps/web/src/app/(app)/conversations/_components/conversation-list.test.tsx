import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConversationList from "./conversation-list";
import { listConversations, type ConversationSummary } from "@/lib/conversations";

vi.mock("@/lib/conversations", () => ({
  listConversations: vi.fn(),
}));

const mockedListConversations = vi.mocked(listConversations);

const SAMPLE_ITEM: ConversationSummary = {
  id: "c1",
  title: "測試對話",
  lastMessageAt: "2026-08-12T09:15:00.000Z",
  lastMessagePreview: "測試預覽",
  mode: "normal",
  knowledgeScopes: [],
  model: "standard",
};

/** page defaults to a single, non-paginated page — most existing tests don't care about pagination. */
function singlePage(items: ConversationSummary[]) {
  return { ok: true as const, value: { items, page: 1, pageSize: 2, totalCount: items.length, totalPages: 1 } };
}

describe("ConversationList (E03-S001)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListConversations.mockReturnValue(new Promise(() => {}));

    render(<ConversationList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each conversation's title, preview, and timestamp once loaded", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));

    render(<ConversationList />);

    expect(await screen.findByText("測試對話")).toBeInTheDocument();
    expect(screen.getByText("測試預覽")).toBeInTheDocument();
  });

  it("E03-S002: links each conversation's title to its detail route", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));

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
    mockedListConversations.mockResolvedValue(singlePage([]));

    render(<ConversationList />);

    expect(await screen.findByText("尚無對話，開始你的第一個對話。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ConversationList pagination (E03-S022)", () => {
  it("does not show pagination controls when everything fits on one page", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));

    render(<ConversationList />);

    await screen.findByText("測試對話");
    expect(screen.queryByRole("navigation", { name: "對話列表分頁" })).not.toBeInTheDocument();
  });

  it("shows a page indicator and disables 上一頁 on the first page", async () => {
    mockedListConversations.mockResolvedValue({
      ok: true,
      value: { items: [SAMPLE_ITEM], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });

    render(<ConversationList />);

    await screen.findByText("測試對話");
    expect(screen.getByText("第 1 頁，共 2 頁")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一頁" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "下一頁" })).not.toBeDisabled();
  });

  it("disables 下一頁 on the last page", async () => {
    mockedListConversations.mockResolvedValue({
      ok: true,
      value: { items: [SAMPLE_ITEM], page: 2, pageSize: 2, totalCount: 3, totalPages: 2 },
    });

    render(<ConversationList />);

    await screen.findByText("測試對話");
    expect(screen.getByRole("button", { name: "下一頁" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "上一頁" })).not.toBeDisabled();
  });

  it("clicking 下一頁 re-fetches with the next page number and shows its items", async () => {
    const page1Item = { ...SAMPLE_ITEM, id: "c1", title: "第一頁對話" };
    const page2Item = { ...SAMPLE_ITEM, id: "c2", title: "第二頁對話" };
    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [page1Item], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });

    render(<ConversationList />);
    await screen.findByText("第一頁對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [page2Item], page: 2, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));

    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(2));
    expect(await screen.findByText("第二頁對話")).toBeInTheDocument();
    expect(screen.queryByText("第一頁對話")).not.toBeInTheDocument();
  });

  it("clicking 上一頁 re-fetches with the previous page number", async () => {
    const page2Item = { ...SAMPLE_ITEM, id: "c2", title: "第二頁對話" };
    const page1Item = { ...SAMPLE_ITEM, id: "c1", title: "第一頁對話" };
    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [page1Item], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    render(<ConversationList />);
    await screen.findByText("第一頁對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [page2Item], page: 2, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await screen.findByText("第二頁對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [page1Item], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: "上一頁" }));

    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1));
    expect(await screen.findByText("第一頁對話")).toBeInTheDocument();
  });
});
