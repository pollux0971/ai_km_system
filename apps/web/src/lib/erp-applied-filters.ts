import { ERP_SCENARIO_OPTIONS } from "./erp-scenarios";

/**
 * E09-S012 "Applied-filter display". Not a duplicate of the existing
 * "查詢情境:{label}" line (E09-S003) — that shows *which* scenario was
 * chosen; this shows *why*, by listing the scenario's own keywords that
 * actually appear in the question text. Reuses the identical
 * substring-match rule matchErpScenarios/isAmbiguousErpQuery already
 * establish (`questionText.includes(keyword)`), scoped to one
 * already-known scenario rather than searching across all of them — not
 * a second, potentially-diverging matching algorithm.
 *
 * A scenario can be selected with zero real keyword matches (E09-S004's
 * own ambiguous-fallback picker lets a user manually pick any of the
 * whitelisted scenarios even when none genuinely matched) — the label
 * says so honestly rather than fabricating a match that didn't happen.
 */
const FALLBACK_LABEL = "已套用篩選：無法判定";
const NO_MATCH_LABEL = "已套用篩選：無自動偵測關鍵字(使用者手動選擇此情境)";

export function getAppliedFilterLabel(scenarioId: string, questionText: string): string {
  const scenario = ERP_SCENARIO_OPTIONS.find((option) => option.id === scenarioId);
  if (!scenario) return FALLBACK_LABEL;

  const matchedKeywords = scenario.keywords.filter((keyword) => questionText.includes(keyword));
  if (matchedKeywords.length === 0) return NO_MATCH_LABEL;

  return `已套用篩選：${matchedKeywords.join("、")}`;
}
