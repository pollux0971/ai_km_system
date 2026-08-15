/**
 * E07-S007 "Current-step card". A diagnostic session's step-by-step
 * interior — the thing diagnostic-sessions.ts's own doc comment (E07-S006)
 * explicitly deferred: "Deliberately minimal: `status` and nothing about
 * actual step/node progress yet — E07-S007 'Current-step card' onward...
 * are their own later stories for real step content."
 *
 * The real thing this stands in for — DecisionTree/DecisionNode/
 * DecisionEdge (E08-S05/S06/S07) and the traversal logic that picks a
 * session's actual current node (E08-S10 "Node Transition") — is Team B's
 * (Maintenance Intelligence Backend), and zero contracts exist yet under
 * contracts/ for any of them. Per /advisor analysis for this story: the
 * line to hold is "don't model branching" — DecisionNode/DecisionEdge is a
 * graph with conditional traversal, and building even a mock version of
 * that graph here would be standing up a shadow implementation of Team B's
 * own algorithm (Domain Ownership Boundary: "不得自行在對方 Domain 補一套
 * 影子實作"). This file deliberately does NOT do that — there is exactly
 * one step, it never branches, and nothing in this story's own scope lets
 * a session move to a second one (that's E07-S08 "Decision Options" and
 * neighbors, once E08-S10 exists to tell it what "next" even means).
 *
 * `instruction`'s copy is explicitly labeled "（模擬步驟）" — same
 * convention answer-state.ts's own ANSWER_STATE_FALLBACK_CONTENT already
 * established for content standing in for something a real backend would
 * eventually author (there "a real RAG answer", here "a real SOP-derived
 * diagnostic instruction"): an honest, unmistakable placeholder, not
 * invented enterprise procedure text dressed up to look authoritative.
 * The instruction itself is deliberately generic (describe the observed
 * symptom) rather than equipment- or error-code-specific — a genuinely
 * universal first step in any troubleshooting flow, not a fabricated SOP
 * for any particular piece of equipment this codebase has no real
 * knowledge of.
 *
 * No parameters, no persisted `currentStepIndex` on DiagnosticSession
 * itself — this is a pure computation, not stored state, since nothing in
 * this story's scope ever changes which step is "current". Storing a
 * field now would risk shaping it around a guess at what E08's real
 * contract will look like; staying derived means there is nothing to
 * migrate away from when that contract lands.
 */
export interface DiagnosticStep {
  stepIndex: number;
  instruction: string;
}

const CURRENT_STEP: DiagnosticStep = {
  stepIndex: 0,
  instruction: "（模擬步驟）請描述目前觀察到的異常現象(聲音、狀態燈號、錯誤訊息等),作為後續診斷的依據。",
};

/**
 * The current step for a diagnostic session. Synchronous and unwrapped
 * (not `Promise<Result<...>>`) — unlike getMaintenanceCase/
 * getDiagnosticSessionForCase, this models no network round-trip and has
 * no failure mode to represent; same reasoning classifyAnswerState
 * (answer-state.ts) already follows for a pure derivation. Takes no
 * session/case argument: every session's current step is this same
 * single deterministic value today, since nothing yet exists to make it
 * vary (see this file's own top doc comment).
 */
export function getCurrentDiagnosticStep(): DiagnosticStep {
  return CURRENT_STEP;
}
