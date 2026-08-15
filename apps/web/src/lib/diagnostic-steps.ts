/**
 * E07-S007 "Current-step card" / E07-S008 "Decision options". A diagnostic
 * session's step-by-step interior — the thing diagnostic-sessions.ts's own
 * doc comment (E07-S006) explicitly deferred: "Deliberately minimal:
 * `status` and nothing about actual step/node progress yet."
 *
 * The real thing this stands in for — DecisionTree/DecisionNode/
 * DecisionEdge (E08-S05/S06/S07) and the traversal logic that picks a
 * session's actual next node (E08-S10 "Node Transition") — is Team B's
 * (Maintenance Intelligence Backend), and zero contracts exist yet under
 * contracts/ for any of them. Per /advisor analysis for E07-S007 (still
 * held here for E07-S008): the line to hold is "don't model branching" —
 * DecisionNode/DecisionEdge is a graph with conditional traversal, and
 * building even a mock version of that graph would be standing up a
 * shadow implementation of Team B's own algorithm (Domain Ownership
 * Boundary: "不得自行在對方 Domain 補一套影子實作"). DIAGNOSTIC_STEPS below
 * is deliberately a flat, linear sequence, not a graph — every option on
 * step 0 advances to the SAME step 1 (see selectDecisionOption in
 * diagnostic-sessions.ts). Which option a user picks is honestly recorded
 * (DiagnosticSession.lastSelectedOptionId) so the choice has a real,
 * observable, testable effect — it just never decides WHERE the session
 * goes next, since that "which edge does this choice follow" judgment is
 * exactly Team B's algorithm, not Team A's to invent.
 *
 * Every `instruction` is explicitly labeled "（模擬步驟）" — same
 * convention answer-state.ts's own ANSWER_STATE_FALLBACK_CONTENT already
 * established for content standing in for something a real backend would
 * eventually author (there "a real RAG answer", here "a real SOP-derived
 * diagnostic instruction"): an honest, unmistakable placeholder, not
 * invented enterprise procedure text dressed up to look authoritative.
 * Content is deliberately generic (describe the observed symptom; record
 * whether it's resolved) rather than equipment- or error-code-specific —
 * a genuinely universal shape for any troubleshooting flow, not a
 * fabricated SOP for any particular piece of equipment this codebase has
 * no real knowledge of. Step 0's two options are the same kind of
 * generic classification, not equipment-specific technical choices.
 *
 * No persisted field shaped around a guess at E08's real contract still
 * lives on DiagnosticSession beyond the plain `currentStepIndex` E07-S008
 * itself needs (see that type's own doc comment) — DIAGNOSTIC_STEPS'
 * actual step CONTENT stays here, looked up by index, so there is nothing
 * tree-shaped to migrate away from when E08's contract lands.
 *
 * `safetyWarning` (E07-S016 "Safety warning component") is optional, same
 * asymmetric-per-step shape `options` already establishes (only step 0 has
 * one today — describing/approaching potentially-hazardous equipment
 * carries real risk; step 1's own pure "recorded, continuing" filler
 * involves no physical interaction, so it gets none). Deliberately a plain
 * field on `DiagnosticStep` itself, NOT a separate async lookup module the
 * way diagnostic-explanations.ts/diagnostic-citations.ts (E07-S014/S015)
 * are: a safety warning is intrinsic, always-known content about the step
 * itself — same category as `instruction`, not optional exploratory
 * content a user opts into on demand. current-step-card.tsx renders it
 * eagerly whenever present, deliberately NOT behind a toggle the way AI
 * 說明/SOP 引用來源 are — hiding safety information behind a click would be
 * the wrong UX for something the user must see, not something they might
 * want to explore. This story does not block interaction on
 * acknowledging the warning — that's E07-S017 "High-risk confirmation
 * gate"'s own explicit, separate scope, same "later story owns the
 * blocking/confirmation behavior" restraint restartDiagnosticSession's own
 * doc comment already shows for E07-S017. Labeled "（模擬警告）", same
 * `（模擬X）` convention `instruction`/`ANSWER_STATE_FALLBACK_CONTENT`
 * already establish.
 */
export interface DecisionOption {
  id: string;
  label: string;
}

export interface DiagnosticStep {
  stepIndex: number;
  instruction: string;
  options?: DecisionOption[];
  safetyWarning?: string;
}

const DIAGNOSTIC_STEPS: DiagnosticStep[] = [
  {
    stepIndex: 0,
    instruction: "（模擬步驟）請描述目前觀察到的異常現象(聲音、狀態燈號、錯誤訊息等),作為後續診斷的依據。",
    options: [
      { id: "resolved", label: "異常已排除" },
      { id: "still-present", label: "異常仍然存在" },
    ],
    safetyWarning:
      "（模擬警告）觀察設備時請保持安全距離,避免直接碰觸高溫或帶電部位。如有明顯異常(冒煙、異味、火花),請立即停止並回報,不要自行處理。",
  },
  {
    stepIndex: 1,
    instruction: "（模擬步驟）已記錄您的判斷,診斷持續進行中。",
  },
];

/**
 * The step at `stepIndex` (defaulting to 0, E07-S007's own original
 * behavior — every existing call site/test that predates E07-S008 keeps
 * working unchanged). Synchronous and unwrapped (not
 * `Promise<Result<...>>`) — unlike getMaintenanceCase/
 * getDiagnosticSessionForCase, this models no network round-trip and has
 * no ordinary failure mode to represent; same reasoning classifyAnswerState
 * (answer-state.ts) already follows for a pure derivation.
 *
 * Throws for an index outside DIAGNOSTIC_STEPS rather than silently
 * returning `undefined` content — required under this repo's
 * `noUncheckedIndexedAccess`, and an honest loud failure for a state that
 * should be structurally unreachable (selectDecisionOption in
 * diagnostic-sessions.ts only ever advances a session to an index that
 * exists), same "if this ever fires it's a real bug, not a valid state to
 * paper over" reasoning diagnostic-sessions.test.ts's own
 * `if (!equipment) throw ...` fixture guards already use.
 */
export function getCurrentDiagnosticStep(stepIndex = 0): DiagnosticStep {
  const step = DIAGNOSTIC_STEPS[stepIndex];
  if (!step) {
    throw new Error(`no diagnostic step defined for index ${stepIndex}`);
  }
  return step;
}
