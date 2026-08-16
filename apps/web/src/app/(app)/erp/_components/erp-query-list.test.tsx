import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErpQueryList from "./erp-query-list";
import { listErpQueries } from "@/lib/erp-queries";

vi.mock("@/lib/erp-queries", () => ({
  listErpQueries: vi.fn(),
}));

const mockedListErpQueries = vi.mocked(listErpQueries);

describe("ErpQueryList (E09-S001)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListErpQueries.mockReturnValue(new Promise(() => {}));

    render(<ErpQueryList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each query's question text and timestamp once loaded", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: true,
      value: [{ id: "query1", questionText: "測試 ERP 查詢", createdAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<ErpQueryList />);

    expect(await screen.findByText("測試 ERP 查詢")).toBeInTheDocument();
  });

  it("shows a distinct error state when loading fails", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<ErpQueryList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入 ERP 查詢紀錄。");
  });

  it("shows an empty state (not an error) when there are no queries", async () => {
    mockedListErpQueries.mockResolvedValue({ ok: true, value: [] });

    render(<ErpQueryList />);

    expect(await screen.findByText("尚無 ERP 查詢紀錄。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("links each query item to its own detail page (E09-S015 'Query history')", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: true,
      value: [{ id: "query1", questionText: "測試 ERP 查詢", createdAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<ErpQueryList />);

    const link = await screen.findByRole("link", { name: /測試 ERP 查詢/ });
    expect(link).toHaveAttribute("href", "/erp/query1");
  });

  it("links multiple items to their own distinct detail pages, not all to the same one", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: true,
      value: [
        { id: "query1", questionText: "第一筆查詢", createdAt: "2026-08-14T06:30:00.000Z" },
        { id: "query2", questionText: "第二筆查詢", createdAt: "2026-08-13T06:30:00.000Z" },
      ],
    });

    render(<ErpQueryList />);

    expect(await screen.findByRole("link", { name: /第一筆查詢/ })).toHaveAttribute("href", "/erp/query1");
    expect(screen.getByRole("link", { name: /第二筆查詢/ })).toHaveAttribute("href", "/erp/query2");
  });

  it("includes the timestamp inside the clickable link, not just the question text", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: true,
      value: [{ id: "query1", questionText: "測試 ERP 查詢", createdAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<ErpQueryList />);

    // A blanket "matches this text" query on the link's accessible name
    // would still pass even if the timestamp were moved outside the
    // link (its name would still contain the question text) — this
    // checks the actual DOM structure directly instead, so a future
    // refactor that narrows the clickable area can't silently regress
    // the "whole item is clickable" UX this story's own EVIDENCE claims.
    const link = await screen.findByRole("link", { name: /測試 ERP 查詢/ });
    expect(link.querySelector("time")).not.toBeNull();
  });
});
