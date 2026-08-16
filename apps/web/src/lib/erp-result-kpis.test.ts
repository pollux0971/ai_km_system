import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultTable } from "./erp-result-tables";
import { getErpResultKpi } from "./erp-result-kpis";

describe("getErpResultKpi (E09-S010)", () => {
  it("returns a value matching the table's total row count for every whitelisted scenario", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      const kpi = getErpResultKpi(scenario.id);
      const table = getErpResultTable(scenario.id);

      expect(kpi.value).toBe(table.rows.length);
    }
  });

  it("returns a non-empty label for every whitelisted scenario", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      expect(getErpResultKpi(scenario.id).label).toBeTruthy();
    }
  });

  it("returns different labels for different scenarios", () => {
    const revenueKpi = getErpResultKpi("revenue-by-branch");
    const stockKpi = getErpResultKpi("low-stock-items");

    expect(revenueKpi.label).not.toBe(stockKpi.label);
  });

  it("is stable across repeated calls for the same scenario", () => {
    const first = getErpResultKpi("revenue-by-branch");
    const second = getErpResultKpi("revenue-by-branch");

    expect(first).toEqual(second);
  });

  it("returns a zero value and a generic label (not a crash) for an unrecognized scenario id", () => {
    const kpi = getErpResultKpi("not-a-real-scenario-id");

    expect(kpi.value).toBe(0);
    expect(kpi.label).toBeTruthy();
  });
});
