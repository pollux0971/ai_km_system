import type { ErpResultTable } from "./erp-result-tables";

function escapeCsvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * E09-S016 "Excel export action". Same RFC4180-shaped CSV (CRLF row
 * separators, double-quote escaping) as maintenance-report.tsx's own
 * casesToCsv (E07-S022) — that remains the only export/download
 * precedent anywhere in this codebase, and its own doc comment confirms
 * nothing shared was ever extracted from it, so this is a fresh,
 * bespoke copy for E09's own domain rather than an cross-epic import.
 *
 * Takes the full ErpResultTable (getErpResultTable's own return shape,
 * not paginateErpResultTable's page-sliced view) — an export is expected
 * to contain the whole result set regardless of which page the table is
 * currently scrolled to, not just what happens to be on screen.
 */
export function erpResultTableToCsv(table: ErpResultTable): string {
  const lines = [table.columns.map(escapeCsvField).join(",")];
  for (const row of table.rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n");
}
