import { getErpResultTable } from "./erp-result-tables";

/**
 * E09-S011 "Chart renderer". No charting library exists anywhere in
 * this codebase (checked before writing this file) — a hand-rolled,
 * dependency-free horizontal bar chart is the honest MVP simplification
 * AC 8 allows, not a missing capability.
 *
 * Bars are derived from the table's own row data (getErpResultTable),
 * same "derive, don't hand-duplicate" reasoning erp-result-kpis.ts
 * already established after E09-S008's own independent review caught a
 * hand-typed number drifting from the table it was supposed to describe.
 * Each row's own first cell becomes the bar's label, second cell becomes
 * its displayed detail text (shown verbatim — never a re-derived number
 * that could disagree with what the table itself already shows).
 *
 * Not every scenario's second column is numeric (purchase-order-status'
 * own is 供應商, a supplier name) — parseNumericCell returning null for
 * any row in the table falls the whole chart back to uniform full-width
 * bars, rather than guessing which column *should* have been charted per
 * scenario (a source of exactly the kind of scenario-specific special-
 * casing this epic's own files have consistently avoided).
 */
export interface ErpResultChartBar {
  label: string;
  detail: string;
  widthPercent: number;
}

export interface ErpResultChart {
  bars: ErpResultChartBar[];
}

export function parseNumericCell(cell: string): number | null {
  const cleaned = cell
    .replace(/^NT\$\s*/, "")
    .replace(/,/g, "")
    .replace(/%$/, "")
    .replace(/^\+/, "")
    .trim();

  if (cleaned === "") return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export function getErpResultChart(scenarioId: string): ErpResultChart {
  const table = getErpResultTable(scenarioId);

  if (table.rows.length === 0) {
    return { bars: [] };
  }

  const parsedValues = table.rows.map((row) => parseNumericCell(row[1] ?? ""));
  const allNumeric = parsedValues.every((value) => value !== null);
  const maxValue = allNumeric ? Math.max(...(parsedValues as number[])) : 0;

  return {
    bars: table.rows.map((row, index) => ({
      label: row[0] ?? "",
      detail: row[1] ?? "",
      widthPercent: allNumeric && maxValue > 0 ? ((parsedValues[index] as number) / maxValue) * 100 : 100,
    })),
  };
}
