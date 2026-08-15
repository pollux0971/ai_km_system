import type { ApiError, Result } from "@ai-km/types";

/**
 * E07-S014 "AI explain-step panel". An honest mock for the real AI-generated
 * step explanation a future Model Gateway/LLM service (Team B) would
 * produce — same "（模擬X）" labeling convention answer-state.ts's own
 * `ANSWER_STATE_FALLBACK_CONTENT` and diagnostic-steps.ts's own
 * `instruction` field already establish, here `（模擬說明）` since neither
 * existing word ("回覆"/reply, "步驟"/step) names this specific kind of
 * content.
 *
 * Static per-`stepIndex` canned text, not a live generation — unlike
 * streaming.ts's own `streamAssistantReply` (this codebase's one example of
 * content genuinely framed as progressively AI-generated, with an artificial
 * `delay()` to make that latency observable), a step's explanation is fixed,
 * already-known content for one of DIAGNOSTIC_STEPS' two fixed entries, not
 * something a real backend would need to compute per-request. Still
 * `Promise<Result<string, ApiError>>`-shaped (matching every other mock
 * "backend" call in this codebase) rather than a plain sync return the way
 * diagnostic-steps.ts's own `getCurrentDiagnosticStep` deliberately is —
 * that function's own doc comment argues sync fits because IT has "no
 * ordinary failure mode to represent"; this one models a real future
 * dependency call (Team B's Model Gateway) that genuinely could fail, so it
 * gets the same async+Result treatment as every other lib/*.ts mock rather
 * than being folded into diagnostic-steps.ts itself.
 */
const STEP_EXPLANATIONS: Record<number, string> = {
  0: "（模擬說明）這個步驟請您描述觀察到的異常現象，是為了讓後續診斷有明確的初步依據。正式版本中，這段說明將由 AI 依據實際案例動態產生，目前為前端固定文字。",
  1: "（模擬說明）您的判斷已經記錄，診斷會依此繼續進行。正式版本中，這段說明將由 AI 依據實際案例動態產生，目前為前端固定文字。",
};

/**
 * Fails closed with NOT_FOUND for a `stepIndex` with no defined explanation
 * — same `readStore().find(...)`-style "reject rather than silently
 * fall back" discipline every diagnostic-sessions.ts lookup already
 * follows. Not reachable through the real UI (current-step-card.tsx only
 * ever passes `step.stepIndex`, which getCurrentDiagnosticStep itself
 * already guarantees is valid), same "structural, not just client-hidden"
 * defense-in-depth precedent selectDecisionOption's own `optionId` guard
 * already establishes.
 */
export async function explainDiagnosticStep(stepIndex: number): Promise<Result<string, ApiError>> {
  const explanation = STEP_EXPLANATIONS[stepIndex];
  if (explanation === undefined) {
    return { ok: false, error: { code: "NOT_FOUND", message: "找不到這個步驟的說明。" } };
  }
  return { ok: true, value: explanation };
}
