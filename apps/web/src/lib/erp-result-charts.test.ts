import { describe, expect, it } from "vitest";
import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";
import { getErpResultTable } from "./erp-result-tables";
import { ERP_RESULT_CHART_MAX_BARS, buildErpResultChart, getErpResultChart, parseNumericCell } from "./erp-result-charts";

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

  it("every real whitelisted scenario stays under the cap today, so hiddenCount is always 0", () => {
    for (const scenario of ERP_SCENARIO_OPTIONS) {
      expect(getErpResultChart(scenario.id).hiddenCount).toBe(0);
    }
  });
});

describe("buildErpResultChart large-result cap (E09-S023)", () => {
  function syntheticTable(rowCount: number) {
    return {
      columns: ["項目", "數值"],
      rows: Array.from({ length: rowCount }, (_, i) => [`項目 ${i + 1}`, String((i + 1) * 100)]),
    };
  }

  it("returns one bar per row and hiddenCount 0 when rows are exactly at the cap", () => {
    const chart = buildErpResultChart(syntheticTable(ERP_RESULT_CHART_MAX_BARS));

    expect(chart.bars.length).toBe(ERP_RESULT_CHART_MAX_BARS);
    expect(chart.hiddenCount).toBe(0);
  });

  it("caps bars at the max and reports the correct hiddenCount when rows exceed it", () => {
    const chart = buildErpResultChart(syntheticTable(ERP_RESULT_CHART_MAX_BARS + 7));

    expect(chart.bars.length).toBe(ERP_RESULT_CHART_MAX_BARS);
    expect(chart.hiddenCount).toBe(7);
  });

  it("keeps the first N rows in their original order when capping, not a reordered subset", () => {
    const table = syntheticTable(ERP_RESULT_CHART_MAX_BARS + 3);
    const chart = buildErpResultChart(table);

    chart.bars.forEach((bar, index) => {
      expect(bar.label).toBe(table.rows[index]![0]);
    });
  });

  it("bases the numeric/non-numeric fallback determination on the shown (capped) rows only, not rows beyond the cap", () => {
    const shownRows = Array.from({ length: ERP_RESULT_CHART_MAX_BARS }, (_, i) => [`項目 ${i + 1}`, String((i + 1) * 100)]);
    const table = { columns: ["項目", "數值"], rows: [...shownRows, ["項目 X", "非數字"]] };

    const chart = buildErpResultChart(table);

    expect(chart.hiddenCount).toBe(1);
    expect(chart.bars[chart.bars.length - 1]!.widthPercent).toBe(100);
    expect(chart.bars[0]!.widthPercent).toBeLessThan(100);
  });
});
