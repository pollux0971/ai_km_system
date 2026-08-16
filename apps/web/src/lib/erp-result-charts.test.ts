import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultTable } from "./erp-result-tables";
import { getErpResultChart, parseNumericCell } from "./erp-result-charts";

describe("parseNumericCell (E09-S011)", () => {
  it("parses a currency-formatted cell to its numeric value", () => {
    expect(parseNumericCell("NT$ 5,200,000")).toBe(5200000);
  });

  it("parses a plain integer cell to its numeric value", () => {
    expect(parseNumericCell("12")).toBe(12);
  });

  it("returns null for a non-numeric cell", () => {
    expect(parseNumericCell("台灣鋼鐵")).toBeNull();
  });

  it("returns null for an empty or whitespace-only cell", () => {
    expect(parseNumericCell("")).toBeNull();
    expect(parseNumericCell("   ")).toBeNull();
  });
});

describe("getErpResultChart (E09-S011)", () => {
  it("returns one bar per table row for every whitelisted scenario", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      const chart = getErpResultChart(scenario.id);
      const table = getErpResultTable(scenario.id);

      expect(chart.bars.length).toBe(table.rows.length);
    }
  });

  it("uses each row's first cell as the bar's label and second cell as its detail text", () => {
    const chart = getErpResultChart("revenue-by-branch");
    const table = getErpResultTable("revenue-by-branch");

    chart.bars.forEach((bar, index) => {
      expect(bar.label).toBe(table.rows[index]![0]);
      expect(bar.detail).toBe(table.rows[index]![1]);
    });
  });

  it("computes a proportional width when every row's second cell is numeric, with the largest value at 100%", () => {
    const chart = getErpResultChart("revenue-by-branch"); // NT$ 5,200,000 / 3,850,000 / 3,400,000

    expect(chart.bars[0]!.widthPercent).toBe(100);
    expect(chart.bars[1]!.widthPercent).toBeCloseTo((3850000 / 5200000) * 100, 5);
    expect(chart.bars[2]!.widthPercent).toBeCloseTo((3400000 / 5200000) * 100, 5);
  });

  it("falls back to uniform full-width bars when any row's second cell isn't numeric", () => {
    const chart = getErpResultChart("purchase-order-status"); // second column is 供應商 (not numeric)

    for (const bar of chart.bars) {
      expect(bar.widthPercent).toBe(100);
    }
  });

  it("returns no bars (not a crash) for an unrecognized scenario id", () => {
    const chart = getErpResultChart("not-a-real-scenario-id");

    expect(chart.bars).toEqual([]);
  });
});
