import { describe, expect, it } from "vitest";
import { erpResultTableToCsv } from "./erp-result-export";
import { getErpResultTable } from "./erp-result-tables";

describe("erpResultTableToCsv (E09-S016)", () => {
  it("returns just the header row (CRLF-terminated column names) for an empty table", () => {
    const csv = erpResultTableToCsv({ columns: ["欄位一", "欄位二"], rows: [] });

    expect(csv).toBe("欄位一,欄位二");
  });

  it("includes every row's cells, comma-joined, one line per row after the header", () => {
    const csv = erpResultTableToCsv({
      columns: ["分公司", "營收金額"],
      rows: [
        ["台北", "5200000"],
        ["台中", "3850000"],
      ],
    });

    expect(csv).toBe(["分公司,營收金額", "台北,5200000", "台中,3850000"].join("\r\n"));
  });

  it("joins lines with CRLF, not a bare LF", () => {
    const csv = erpResultTableToCsv({ columns: ["a"], rows: [["1"], ["2"]] });

    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).not.toMatch(/[^\r]\n/);
  });

  it("does not wrap a plain cell (no comma/quote/newline) in quotes", () => {
    const csv = erpResultTableToCsv({ columns: ["欄位"], rows: [["台北"]] });

    expect(csv).toBe("欄位\r\n台北");
  });

  it("wraps a cell containing a comma in quotes, matching this codebase's own mock currency formatting (e.g. \"NT$ 5,200,000\")", () => {
    const csv = erpResultTableToCsv({ columns: ["金額"], rows: [["NT$ 5,200,000"]] });

    expect(csv).toBe('金額\r\n"NT$ 5,200,000"');
  });

  it("escapes a cell containing a double-quote by doubling it and wrapping the whole field in quotes", () => {
    const csv = erpResultTableToCsv({ columns: ["備註"], rows: [['他說"沒問題"']] });

    expect(csv).toBe('備註\r\n"他說""沒問題"""');
  });

  it("wraps a cell containing a newline in quotes", () => {
    const csv = erpResultTableToCsv({ columns: ["備註"], rows: [["第一行\n第二行"]] });

    expect(csv).toBe('備註\r\n"第一行\n第二行"');
  });

  it("exports every real whitelisted scenario's table without throwing, and preserves every cell's content", () => {
    for (const scenarioId of ["revenue-by-branch", "low-stock-items", "overdue-receivables", "purchase-order-status"]) {
      const table = getErpResultTable(scenarioId);
      const csv = erpResultTableToCsv(table);

      for (const row of table.rows) {
        for (const cell of row) {
          expect(csv).toContain(cell);
        }
      }
    }
  });
});
