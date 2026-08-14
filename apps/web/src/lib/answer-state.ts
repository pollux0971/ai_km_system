/**
 * E03-S021 "Answer state rendering". Unlike most stories in this epic,
 * SOURCE_BASELINE.md gives this one concrete content (line 1204-1212):
 *
 *   E03-S21 Answer State
 *   ANSWERED
 *   PARTIAL
 *   NO_EVIDENCE
 *   ERROR
 *   PERMISSION_DENIED
 *   SOURCE_UNAVAILABLE
 *
 * `AnswerState`'s values are these exact names, traceable straight back
 * to the source (same split as GenerationPhase's English values vs
 * GENERATION_PHASE_LABELS' Chinese display text).
 *
 * These 6 values are a REAL semantic classification (SOURCE_BASELINE
 * §5's pinned decisions #7/#8/#10/#11 ground PERMISSION_DENIED and
 * NO_EVIDENCE/abstain as real product principles, not decorative UI
 * states), but classifying them for real needs a real RAG/authorization
 * backend (E04/E02, Team B) that doesn't exist yet — this file is
 * explicitly NOT that. Per SOURCE_BASELINE §5 pinned decision #32
 * ("Feature 可以 MVP 簡化，但不能完全消失") and #35 ("Team A 不等待
 * Backend 完成才開始"), plus readme_zh.md's explicit "Team A 可以建立
 * Mock...來避免等待 Team B，但不得繞過...Authorization" — Team A is
 * meant to build ahead with an honest mock here, not leave 5 of the 6
 * states permanently unreachable in practice just because a real
 * classifier doesn't exist. This doesn't "bypass" authorization in the
 * sense that policy line forbids: there is no real authorization
 * decision at this mock layer to bypass, same situation as every other
 * mock in this codebase (mock login, citations.ts's FORBIDDEN_CITATION_IDS).
 *
 * classifyAnswerState() is therefore a DETERMINISTIC, explicitly-labeled
 * mock trigger — same pattern as citations.ts's FORBIDDEN_CITATION_IDS
 * and @ai-km/auth-client's MOCK_VALID_USERNAME/PASSWORD, both already
 * independently reviewed and approved. Trigger phrases are bracketed,
 * English-enum-named markers (`[模擬:NO_EVIDENCE]` etc.) rather than
 * anything resembling natural question text — deliberately unmistakable
 * as a demo/test hook, matching lib/streaming.ts's MOCK_REPLY's own
 * "clearly-labeled placeholder, not a fabricated real answer" precedent.
 * A real classifier is out of scope for Team A entirely; this is not a
 * placeholder for one, it's how Team A demonstrates and tests the
 * RENDERING side of all 6 states without inventing a fake backend.
 */
export type AnswerState = "ANSWERED" | "PARTIAL" | "NO_EVIDENCE" | "ERROR" | "PERMISSION_DENIED" | "SOURCE_UNAVAILABLE";

export const ANSWER_STATES: AnswerState[] = ["ANSWERED", "PARTIAL", "NO_EVIDENCE", "ERROR", "PERMISSION_DENIED", "SOURCE_UNAVAILABLE"];

export const ANSWER_STATE_LABELS: Record<AnswerState, string> = {
  ANSWERED: "已回答",
  PARTIAL: "部分回答",
  NO_EVIDENCE: "查無依據",
  ERROR: "發生錯誤",
  PERMISSION_DENIED: "無權限查看",
  SOURCE_UNAVAILABLE: "來源無法取得",
};

/**
 * ANSWERED has no trigger (and no entry here) — it's the default for
 * anything that doesn't match one of the other 5, exactly matching
 * every existing message sent before this story (none of which could
 * contain a trigger phrase that didn't exist yet).
 */
export const MOCK_ANSWER_STATE_TRIGGERS: Partial<Record<AnswerState, string>> = {
  PARTIAL: "[模擬:PARTIAL]",
  NO_EVIDENCE: "[模擬:NO_EVIDENCE]",
  ERROR: "[模擬:ERROR]",
  PERMISSION_DENIED: "[模擬:PERMISSION_DENIED]",
  SOURCE_UNAVAILABLE: "[模擬:SOURCE_UNAVAILABLE]",
};

/**
 * Fixed placeholder content for the 4 states where showing the normal
 * MOCK_REPLY text alongside the state label would be actively
 * misleading (a confident-sounding placeholder answer next to a "查無
 * 依據" badge makes no sense). PARTIAL is deliberately absent — "部分
 * 回答" means SOME real answer was given, just incomplete, so it keeps
 * the normal streamed MOCK_REPLY instead of replacing it (see
 * message-thread.tsx's runStream). Each message follows MOCK_REPLY's
 * own "(模擬回覆)" labeling convention — an honest placeholder, not a
 * fabricated real explanation of why the answer is missing.
 */
export const ANSWER_STATE_FALLBACK_CONTENT: Partial<Record<AnswerState, string>> = {
  NO_EVIDENCE: "（模擬回覆）在您有權限的知識範圍內，找不到足夠的依據可以回答這個問題。",
  ERROR: "（模擬回覆）生成回覆時發生錯誤，請稍後再試。",
  PERMISSION_DENIED: "（模擬回覆）您沒有權限查看這個問題所需的資料，因此無法提供回答。",
  SOURCE_UNAVAILABLE: "（模擬回覆）回答這個問題所需的來源目前無法取得，請稍後再試。",
};

/**
 * Scans `userQuestion` for one of MOCK_ANSWER_STATE_TRIGGERS' phrases,
 * returning the first match's state — order follows ANSWER_STATES so
 * results are deterministic if a question somehow contained more than
 * one trigger. Defaults to "ANSWERED", matching current behavior for
 * every question asked before this story existed.
 */
export function classifyAnswerState(userQuestion: string): AnswerState {
  for (const state of ANSWER_STATES) {
    const trigger = MOCK_ANSWER_STATE_TRIGGERS[state];
    if (trigger !== undefined && userQuestion.includes(trigger)) {
      return state;
    }
  }
  return "ANSWERED";
}
