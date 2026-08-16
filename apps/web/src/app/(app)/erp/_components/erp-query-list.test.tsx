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

  it("renders no links on any query item (no query detail route exists yet)", async () => {
    mockedListErpQueries.mockResolvedValue({
      ok: true,
      value: [{ id: "query1", questionText: "測試 ERP 查詢", createdAt: "2026-08-14T06:30:00.000Z" }],
    });

    render(<ErpQueryList />);
    await screen.findByText("測試 ERP 查詢");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
