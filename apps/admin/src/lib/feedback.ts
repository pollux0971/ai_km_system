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
 * shape for this queue shell — originally verdict + optional reason
 * only (matching E13-S001/S002/S003's scope at the time E11-S016 was
 * written). E13-S008 "feedback detail view" extends it with `comment`
 * (E13-S004 free-text feedback) and `citationFeedback` (E13-S005
 * citation-specific feedback), both of which now exist in apps/web's
 * `Message` shape. Both new fields are optional, backward-compatible
 * additions — `listFeedback()` still always returns an empty list, the
 * one honest answer today — no write path exists, since admins cannot
 * legitimately fabricate a user's feedback.
 */
export interface FeedbackItem {
  id: string;
  verdict: "ok" | "ng";
  reason?: string;
  comment?: string;
  citationFeedback?: { citationId: string; verdict: "ok" | "ng" }[];
  submittedAt: string;
}

export async function listFeedback(): Promise<Result<FeedbackItem[], ApiError>> {
  return { ok: true, value: [] };
}

/**
 * E11-S017 "Feedback detail". Same `T | null` shape `getUser`/`getRole`
 * already establish for a single-record lookup by id — but here the
 * answer is unconditionally `null` for every id, the direct consequence
 * of `listFeedback()` above always being empty: there has never been a
 * real feedback item for any id to match.
 */
export async function getFeedback(_id: string): Promise<Result<FeedbackItem | null, ApiError>> {
  return { ok: true, value: null };
}

/**
 * E13-S007 "feedback queue filter". A pure narrowing function, not a new
 * data source — `listFeedback()` above still always returns an empty
 * list (the E11-S016 honesty constraint this story does not touch), so
 * there is nothing real to filter in production today. This function's
 * correctness is proven with fixture data at the unit-test layer, same
 * technique `feedback-list.test.tsx`'s own "loaded" tests already use to
 * verify `FeedbackList`'s render logic despite the same always-empty
 * constraint — the UI only ever calls this on whatever `listFeedback()`
 * actually returned, never on fabricated data.
 */
export interface FeedbackFilterCriteria {
  verdict?: FeedbackItem["verdict"];
  hasReason?: boolean;
}

export function filterFeedback(items: FeedbackItem[], criteria: FeedbackFilterCriteria): FeedbackItem[] {
  return items.filter((item) => {
    if (criteria.verdict !== undefined && item.verdict !== criteria.verdict) {
      return false;
    }
    if (criteria.hasReason !== undefined) {
      const itemHasReason = item.reason != null && item.reason !== "";
      if (itemHasReason !== criteria.hasReason) {
        return false;
      }
    }
    return true;
  });
}

/**
 * E13-S014 "OK/NG rate dashboard". Same "presentation layer already
 * exists" situation E13-S012 (DAU/questions) established, not the
 * "brand-new page" situation E13-S013 (latency) required: `feedback-list.tsx`
 * (E11-S016, extended by E13-S007/S008) already is this queue's dashboard —
 * this story's real, non-duplicate value is a pure aggregation over
 * `listFeedback()`'s already-loaded items, not a new fetch, new endpoint,
 * or new page. `okRatePercent` is `null` for zero samples (same "no
 * natural zero" reasoning `computeAverageLatencyMs`, E13-S013, already
 * establishes) rather than `0`, since a 0%-OK rate and "no feedback exists
 * at all" are different facts an admin should not confuse.
 */
export interface FeedbackOkNgRate {
  okCount: number;
  ngCount: number;
  okRatePercent: number | null;
}

export function computeOkNgRate(items: FeedbackItem[]): FeedbackOkNgRate {
  const okCount = items.filter((item) => item.verdict === "ok").length;
  const ngCount = items.length - okCount;
  return {
    okCount,
    ngCount,
    okRatePercent: items.length === 0 ? null : Math.round((okCount / items.length) * 100),
  };
}
