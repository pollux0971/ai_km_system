/**
 * E09-S008 "Result table". A canned, scenario-specific mock tabular
 * result — same "realistic-looking but honestly fabricated" precedent
 * erp-results.ts's own text summaries already establish, kept in its
 * own file for the same "each story owns its own concern in its own
 * file" reasoning that already separates erp-results.ts from
 * erp-scenarios.ts. Row counts here match what each scenario's own
 * text summary in erp-results.ts already claims (e.g. "3 個分公司"),
 * so the two don't silently contradict each other.
 *
 * No pagination here — E09-S009 "Server pagination UI" is its own
 * separate story for that; this one shows the whole (small, mock)
 * table at once, same "don't invent the next story's own capability"
 * restraint every other story in this epic already follows.
 */
export interface ErpResultTable {
  columns: string[];
  rows: string[][];
}

const ERP_RESULT_TABLES: Record<string, ErpResultTable> = {
  "revenue-by-branch": {
    columns: ["分公司", "營收金額", "較上期成長"],
    rows: [
      ["台北", "NT$ 5,200,000", "+6%"],
      ["台中", "NT$ 3,850,000", "+11%"],
      ["高雄", "NT$ 3,400,000", "+7%"],
    ],
  },
  "low-stock-items": {
    columns: ["品項名稱", "目前庫存", "安全存量"],
    rows: [
      ["軸承 A-102", "12", "50"],
      ["密封圈 B-207", "8", "40"],
      ["馬達皮帶 C-315", "3", "20"],
      ["感測器模組 D-088", "5", "30"],
      ["潤滑油 E-451", "15", "60"],
    ],
  },
  "overdue-receivables": {
    columns: ["客戶名稱", "逾期金額", "逾期天數"],
    rows: [
      ["大成貿易", "NT$ 320,000", "45"],
      ["永新工業", "NT$ 180,000", "22"],
      ["宏泰科技", "NT$ 210,000", "60"],
      ["中南五金", "NT$ 140,000", "15"],
    ],
  },
  "purchase-order-status": {
    columns: ["採購單號", "供應商", "狀態"],
    rows: [
      ["PO-20260801", "台灣鋼鐵", "待到貨"],
      ["PO-20260805", "誠信零件", "待到貨"],
      ["PO-20260809", "宏達五金", "已延遲"],
      ["PO-20260812", "全球物流", "待到貨"],
    ],
  },
};

/**
 * Returns the canned mock table for a whitelisted scenario id. Never
 * throws for an unrecognized id — falls back to an empty-rows table
 * with a generic column so the caller always gets a well-formed shape
 * to render, same fail-closed-but-actionable reasoning
 * getErpResultSummary's own fallback already follows.
 */
export function getErpResultTable(scenarioId: string): ErpResultTable {
  return ERP_RESULT_TABLES[scenarioId] ?? { columns: ["查無資料"], rows: [] };
}
