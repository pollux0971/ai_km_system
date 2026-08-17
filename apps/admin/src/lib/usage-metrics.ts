import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S021 "Usage dashboard". Same treatment `feedback.ts`'s own
 * E11-S016 doc comment already establishes for a sibling concept: the
 * real usage-tracking pipeline this dashboard would eventually show is
 * `AI_KM_BMAD_High_Granularity/epics/E13_Feedback_&_Analytics.md`'s own
 * "E13-S009 usage event instrumentation" / "E13-S010 conversation
 * analytics events" (both Owner: Team A) feeding "E13-S012 DAU/
 * questions dashboard" — this story's own direct real-data source —
 * none of which have been reached yet in this codebase's own
 * E01→E03→E05→E07→E09→E11→E13 development sequencing. `contracts/`
 * has zero usage/analytics content either way.
 *
 * `UsageMetrics` below covers only what E13-S012's own title names
 * (DAU + questions) — not E13-S013's latency or E13-S014's OK/NG rate,
 * each its own separate future story.
 *
 * `getUsageMetrics()` always returns zero counts — the one honest
 * answer today. A fabricated non-zero placeholder (e.g. a plausible-
 * looking "42") would be a MORE dangerous form of dishonesty than an
 * empty list ever is: an admin reading a number has no way to tell a
 * real measurement from an invented one, whereas an empty list is
 * self-evidently "nothing here". No write path exists — there is no
 * legitimate way for this story to ever increment these counts itself.
 */
export interface UsageMetrics {
  dailyActiveUsers: number;
  questionsAsked: number;
}

export async function getUsageMetrics(): Promise<Result<UsageMetrics, ApiError>> {
  return { ok: true, value: { dailyActiveUsers: 0, questionsAsked: 0 } };
}
