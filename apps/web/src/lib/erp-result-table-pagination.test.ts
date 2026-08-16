import { describe, expect, it } from "vitest";
import { getErpResultTable } from "./erp-result-tables";
import { ERP_RESULT_TABLE_PAGE_SIZE, paginateErpResultTable } from "./erp-result-table-pagination";

describe("paginateErpResultTable (E09-S009)", () => {
  const revenueTable = getErpResultTable("revenue-by-branch"); // 3 rows
  const stockTable = getErpResultTable("low-stock-items"); // 5 rows

  it("returns only the first pageSize rows on page 1", () => {
    const result = paginateErpResultTable(revenueTable, 1, 2);

    expect(result.rows).toEqual([revenueTable.rows[0], revenueTable.rows[1]]);
  });

  it("returns the remaining rows on the last page", () => {
    const result = paginateErpResultTable(revenueTable, 2, 2);

    expect(result.rows).toEqual([revenueTable.rows[2]]);
  });

  it("computes totalPages as ceil(totalRows / pageSize)", () => {
    expect(paginateErpResultTable(revenueTable, 1, 2).totalPages).toBe(2); // 3 rows
    expect(paginateErpResultTable(stockTable, 1, 2).totalPages).toBe(3); // 5 rows
  });

  it("clamps an out-of-range page number down to the last page", () => {
    const result = paginateErpResultTable(revenueTable, 99, 2);

    expect(result.page).toBe(2);
    expect(result.rows).toEqual([revenueTable.rows[2]]);
  });

  it("clamps a page number below 1 up to 1", () => {
    const result = paginateErpResultTable(revenueTable, 0, 2);

    expect(result.page).toBe(1);
    expect(result.rows).toEqual([revenueTable.rows[0], revenueTable.rows[1]]);
  });

  it("keeps totalPages at 1 (not 0) for an empty table, and returns zero rows", () => {
    const emptyTable = { columns: ["查無資料"], rows: [] };
    const result = paginateErpResultTable(emptyTable, 1, 2);

    expect(result.totalPages).toBe(1);
    expect(result.page).toBe(1);
    expect(result.rows).toEqual([]);
  });

  it("passes columns through unchanged regardless of page", () => {
    const result = paginateErpResultTable(revenueTable, 2, 2);

    expect(result.columns).toEqual(revenueTable.columns);
  });

  it("is stable across repeated calls with the same arguments", () => {
    const first = paginateErpResultTable(revenueTable, 1, 2);
    const second = paginateErpResultTable(revenueTable, 1, 2);

    expect(first).toEqual(second);
  });

  it("defaults to ERP_RESULT_TABLE_PAGE_SIZE when pageSize is omitted", () => {
    const result = paginateErpResultTable(stockTable, 1);

    expect(result.pageSize).toBe(ERP_RESULT_TABLE_PAGE_SIZE);
    expect(result.rows.length).toBe(ERP_RESULT_TABLE_PAGE_SIZE);
  });
});
