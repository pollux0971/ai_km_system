import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S016 "Feedback queue". Same treatment `audit.ts`'s own E11-S015
 * doc comment already establishes for a sibling "true historical record"
 * concept: a feedback item represents a real user's real OK/NG verdict
 * on a real answer — fabricating sample entries here would misrepresent
 * events that never happened, a different and more serious kind of
 * dishonesty than an empty catalog an admin can freely populate (like
 * `prompts.ts`). Unlike every prior Team-B-dependency story though, the
 * missing piece here is Team A's own sibling epic — `AI_KM_BMAD_High_
 * Granularity/epics/E13_Feedback_&_Analytics.md`'s own "E13-S001 Answer
 * OK feedback"/"E13-S002 Answer NG feedback" (Owner: Team A) — which
 * hasn't been reached yet in this codebase's own E01→E03→E05→E07→E09→
 * E11→E13 development sequencing (`.claude/rules/STORY_WORKFLOW.md`'s
 * own global rule #2), not a cross-team gap. `contracts/` has zero
 * feedback content either way.
 *
 * `FeedbackItem`'s shape below is Team A's own provisional DISPLAY
 * shape for this queue shell — deliberately minimal (verdict + optional
 * reason, matching only E13-S001/S002/S003's scope), not a claim about
 * what E13-S004's free-text or E13-S005's citation-specific fields will
 * eventually add. `listFeedback()` always returns an empty list — the
 * one honest answer today — no write path exists, since admins cannot
 * legitimately fabricate a user's feedback.
 */
export interface FeedbackItem {
  id: string;
  verdict: "ok" | "ng";
  reason?: string;
  submittedAt: string;
}

export async function listFeedback(): Promise<Result<FeedbackItem[], ApiError>> {
  return { ok: true, value: [] };
}
