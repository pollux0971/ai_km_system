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
 * Keyword substring containment against ERP_SCENARIO_OPTIONS — the
 * MVP-honest equivalent of "AI-generated SQL restricted to whitelisted
 * views" (SOURCE_BASELINE pinned #20/#21): this never invents a query
 * outside the whitelist, it only ever narrows or falls back to it.
 * Shared by matchErpScenarios (E09-S003) and isAmbiguousErpQuery
 * (E09-S004) so both stay consistent about what counts as "matched"
 * without either one calling into the other's own public contract.
 */
function realMatches(questionText: string): ErpQueryScenario[] {
  return ERP_SCENARIO_OPTIONS.filter((scenario) => scenario.keywords.some((keyword) => questionText.includes(keyword)));
}

/**
 * E09-S003 "Query scenario selector". Falls back to every whitelisted
 * scenario (not an empty list) when nothing matches — same "never leave
 * the user with nothing to pick" reasoning ErrorMessage's own
 * fail-closed-but-actionable states follow elsewhere.
 */
export function matchErpScenarios(questionText: string): ErpQueryScenario[] {
  const matches = realMatches(questionText);
  return matches.length > 0 ? matches : ERP_SCENARIO_OPTIONS;
}

/**
 * E09-S004 "Clarification UI". True exactly when matchErpScenarios()
 * would be showing its bare fallback (every scenario, because none
 * genuinely matched) rather than a real match — the signal the picker UI
 * uses to show clarifying wording instead of the plain "pick the closest
 * match" prompt. Deliberately a separate function rather than changing
 * matchErpScenarios' own return shape to carry this — that function's
 * signature and behavior are already covered by E09-S003's own approved
 * tests, which this story leaves untouched.
 */
export function isAmbiguousErpQuery(questionText: string): boolean {
  return realMatches(questionText).length === 0;
}
