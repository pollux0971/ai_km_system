import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultTable } from "./erp-result-tables";

describe("getErpResultTable (E09-S008)", () => {
  it("returns a non-empty table (columns and rows) for every whitelisted scenario", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      const table = getErpResultTable(scenario.id);

      expect(table.columns.length).toBeGreaterThan(0);
      expect(table.rows.length).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(row.length).toBe(table.columns.length);
      }
    }
  });

  it("returns different table content for different scenarios", () => {
    const revenueTable = getErpResultTable("revenue-by-branch");
    const stockTable = getErpResultTable("low-stock-items");

    expect(revenueTable.columns).not.toEqual(stockTable.columns);
  });

  it("returns a stable table across repeated calls for the same scenario", () => {
    const first = getErpResultTable("revenue-by-branch");
    const second = getErpResultTable("revenue-by-branch");

    expect(first).toEqual(second);
  });

  it("returns an empty-rows table (not a crash) for an unrecognized scenario id", () => {
    const table = getErpResultTable("not-a-real-scenario-id");

    expect(table.columns.length).toBeGreaterThan(0);
    expect(table.rows).toEqual([]);
  });
});
