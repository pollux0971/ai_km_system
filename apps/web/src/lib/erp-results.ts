/**
 * E09-S007 "Text summary". A canned, scenario-specific mock result —
 * same "realistic-looking but honestly fabricated" precedent every
 * simulated ERP query result in this MVP follows (there is no real E10
 * backend yet — see erp-queries.ts's own doc comment). Keyed by
 * ERP_SCENARIO_OPTIONS' own `id`, kept in this separate file rather than
 * added as a field on `ErpQueryScenario` itself: matching a scenario
 * (E09-S003's own concern) and describing what a completed query against
 * it looks like (this story's own concern) are different responsibilities
 * that happen to share the same key, same "each story owns its own
 * concern in its own file" precedent erp-execution.ts already establishes
 * relative to erp-queries.ts.
 *
 * Deliberately NOT persisted onto ErpQuerySummary — a query's result
 * summary is a pure function of its own `selectedScenarioId` (this mock
 * has no per-query varying data), same "don't store what can be derived"
 * restraint `selectedScenario` itself already follows in
 * erp-query-detail.tsx (looked up via matchErpScenarios().find(...), not
 * a separate stored field).
 */
const ERP_RESULT_SUMMARIES: Record<string, string> = {
  "revenue-by-branch": "本次查詢共涵蓋 3 個分公司,總營收為 NT$ 12,450,000,較上期成長 8%。",
  "low-stock-items": "共發現 5 項庫存低於安全存量的品項,建議儘快補貨。",
  "overdue-receivables": "共有 8 筆逾期應收帳款,總金額 NT$ 850,000。",
  "purchase-order-status": "目前有 4 張採購單處於待到貨狀態。",
};

const FALLBACK_SUMMARY = "查詢已完成,但目前沒有可顯示的摘要內容。";

/**
 * Returns the canned mock summary for a whitelisted scenario id. Never
 * throws for an unrecognized id — falls back to a generic, still-honest
 * message rather than a blank/broken render, same fail-closed-but-
 * actionable reasoning matchErpScenarios' own fallback already follows.
 */
export function getErpResultSummary(scenarioId: string): string {
  return ERP_RESULT_SUMMARIES[scenarioId] ?? FALLBACK_SUMMARY;
}
