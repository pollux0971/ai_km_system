/**
 * E09-S003 "Query scenario selector". A fixed, whitelisted set of ERP
 * query types — not a Team A invention: SOURCE_BASELINE §5's own pinned
 * decisions (#19-22) require the ERP assistant's AI-generated SQL to be
 * restricted to SELECT-only, whitelisted views, always audited. A
 * "scenario" here is the frontend-facing name for one of those
 * whitelisted views/query shapes — the natural-language question gets
 * matched to one (or more) of these, never to arbitrary free-form SQL.
 *
 * Plain fixed array, not a sessionStorage-backed store — same "no story
 * in Team A's own scope for adding/editing/removing" reasoning
 * EQUIPMENT_OPTIONS/ERROR_CODE_OPTIONS already establish for their own
 * reference lists.
 */
export interface ErpQueryScenario {
  id: string;
  label: string;
  keywords: string[];
}

export const ERP_SCENARIO_OPTIONS: ErpQueryScenario[] = [
  { id: "revenue-by-branch", label: "各分公司營收", keywords: ["營收", "分公司", "銷售額"] },
  { id: "low-stock-items", label: "低庫存品項", keywords: ["庫存", "安全存量", "品項"] },
  { id: "overdue-receivables", label: "逾期應收帳款", keywords: ["應收帳款", "逾期", "客戶"] },
  { id: "purchase-order-status", label: "採購單狀態", keywords: ["採購單", "訂購", "到貨"] },
];

/**
 * Matches a natural-language question against ERP_SCENARIO_OPTIONS by
 * simple keyword substring containment — the MVP-honest equivalent of
 * "AI-generated SQL restricted to whitelisted views" (SOURCE_BASELINE
 * pinned #20/#21): this never invents a query outside the whitelist, it
 * only ever narrows or falls back to it.
 *
 * Falls back to every whitelisted scenario (not an empty list) when
 * nothing matches — same "never leave the user with nothing to pick"
 * reasoning ErrorMessage's own fail-closed-but-actionable states follow
 * elsewhere. E09-S004 "Clarification UI" is free to replace or enrich
 * this bare fallback with a more sophisticated clarifying flow; this
 * story's own scope is only to guarantee the picker is never empty.
 */
export function matchErpScenarios(questionText: string): ErpQueryScenario[] {
  const matches = ERP_SCENARIO_OPTIONS.filter((scenario) =>
    scenario.keywords.some((keyword) => questionText.includes(keyword)),
  );
  return matches.length > 0 ? matches : ERP_SCENARIO_OPTIONS;
}
