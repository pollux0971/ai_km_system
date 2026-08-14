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

    // 2nd arg "" (E03-S023): no search query active. 3rd arg false
    // (E03-S026): viewing the active (not archived) view.
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(2, "", false));
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

    // 2nd arg "" (E03-S023): no search query active. 3rd arg false
    // (E03-S026): viewing the active (not archived) view.
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", false));
    expect(await screen.findByText("第一頁對話")).toBeInTheDocument();
  });
});

describe("ConversationList search (E03-S023)", () => {
  it("typing into the search box re-fetches with the typed query", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));

    render(<ConversationList />);
    await screen.findByText("測試對話");

    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "保固" } });

    // 3rd arg false (E03-S026): viewing the active (not archived) view.
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "保固", false));
  });

  it("shows a distinct empty message (not the generic 'start your first conversation' one) when a search matches nothing", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));
    render(<ConversationList />);
    await screen.findByText("測試對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [], page: 1, pageSize: 2, totalCount: 0, totalPages: 1 },
    });
    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "找不到" } });

    expect(await screen.findByText("查無符合「找不到」的對話。")).toBeInTheDocument();
    expect(screen.queryByText("尚無對話，開始你的第一個對話。")).not.toBeInTheDocument();
  });

  it("a whitespace-only query is treated as no search active for the empty-state message, matching listConversations' own trim", async () => {
    // Independent review MINOR finding: the empty-state branch and
    // listConversations' own "is a search active" check must trim the
    // same way, or a whitespace-only query could show the "no search
    // results" message on a genuinely empty account instead of "start
    // your first conversation". This mock's own listConversations
    // already treats whitespace-only as untrimmed-empty (returns
    // everything) — this test exercises the COMPONENT's message
    // branching in isolation via a directly mocked empty result, since
    // there's no way to reach a truly empty store through this
    // codebase's real data layer (no delete-conversation feature).
    mockedListConversations.mockResolvedValue({
      ok: true,
      value: { items: [], page: 1, pageSize: 2, totalCount: 0, totalPages: 1 },
    });

    render(<ConversationList />);
    await screen.findByText("尚無對話，開始你的第一個對話。");

    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "   " } });

    expect(await screen.findByText("尚無對話，開始你的第一個對話。")).toBeInTheDocument();
    expect(screen.queryByText("查無符合", { exact: false })).not.toBeInTheDocument();
  });

  it("resets to page 1 when the query changes while on a later page", async () => {
    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [SAMPLE_ITEM], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    render(<ConversationList />);
    await screen.findByText("測試對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [{ ...SAMPLE_ITEM, id: "c2", title: "第二頁對話" }], page: 2, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await screen.findByText("第二頁對話");

    mockedListConversations.mockResolvedValueOnce(singlePage([SAMPLE_ITEM]));
    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "測試" } });

    // 3rd arg false (E03-S026): viewing the active (not archived) view.
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "測試", false));
  });
});

describe("ConversationList archived view (E03-S026)", () => {
  it("shows 作用中對話/已封存對話 toggle buttons, with 作用中對話 pressed by default", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));

    render(<ConversationList />);
    await screen.findByText("測試對話");

    expect(screen.getByRole("button", { name: "作用中對話" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "已封存對話" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking 已封存對話 re-fetches with archived=true", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));
    render(<ConversationList />);
    await screen.findByText("測試對話");

    const archivedItem = { ...SAMPLE_ITEM, id: "c2", title: "已封存的對話" };
    mockedListConversations.mockResolvedValueOnce(singlePage([archivedItem]));
    fireEvent.click(screen.getByRole("button", { name: "已封存對話" }));

    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", true));
    expect(await screen.findByText("已封存的對話")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "已封存對話" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "作用中對話" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switching back to 作用中對話 re-fetches with archived=false", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));
    render(<ConversationList />);
    await screen.findByText("測試對話");
    fireEvent.click(screen.getByRole("button", { name: "已封存對話" }));
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", true));

    mockedListConversations.mockResolvedValueOnce(singlePage([SAMPLE_ITEM]));
    fireEvent.click(screen.getByRole("button", { name: "作用中對話" }));

    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", false));
  });

  it("switching views resets an in-progress search query and page", async () => {
    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [SAMPLE_ITEM], page: 1, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    render(<ConversationList />);
    await screen.findByText("測試對話");

    mockedListConversations.mockResolvedValueOnce({
      ok: true,
      value: { items: [SAMPLE_ITEM], page: 2, pageSize: 2, totalCount: 3, totalPages: 2 },
    });
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(2, "", false));

    mockedListConversations.mockResolvedValueOnce(singlePage([SAMPLE_ITEM]));
    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "測試" } });
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "測試", false));

    mockedListConversations.mockResolvedValueOnce(singlePage([]));
    fireEvent.click(screen.getByRole("button", { name: "已封存對話" }));

    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", true));
    expect(screen.getByLabelText("搜尋對話")).toHaveValue("");
  });

  it("shows a distinct empty message ('尚無已封存的對話') when the archived view has zero results", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));
    render(<ConversationList />);
    await screen.findByText("測試對話");

    mockedListConversations.mockResolvedValueOnce(singlePage([]));
    fireEvent.click(screen.getByRole("button", { name: "已封存對話" }));

    expect(await screen.findByText("尚無已封存的對話。")).toBeInTheDocument();
    expect(screen.queryByText("尚無對話，開始你的第一個對話。")).not.toBeInTheDocument();
  });

  it("a search with no matches within the archived view still shows the search-empty message, not the archived-empty one", async () => {
    mockedListConversations.mockResolvedValue(singlePage([SAMPLE_ITEM]));
    render(<ConversationList />);
    await screen.findByText("測試對話");
    mockedListConversations.mockResolvedValueOnce(singlePage([SAMPLE_ITEM]));
    fireEvent.click(screen.getByRole("button", { name: "已封存對話" }));
    await waitFor(() => expect(mockedListConversations).toHaveBeenLastCalledWith(1, "", true));

    mockedListConversations.mockResolvedValueOnce(singlePage([]));
    fireEvent.change(screen.getByLabelText("搜尋對話"), { target: { value: "找不到" } });

    expect(await screen.findByText("查無符合「找不到」的對話。")).toBeInTheDocument();
    expect(screen.queryByText("尚無已封存的對話。")).not.toBeInTheDocument();
  });
});
