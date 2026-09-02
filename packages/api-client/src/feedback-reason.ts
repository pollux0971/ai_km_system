/**
 * E01-S035: shared code -> label mapping for `FeedbackReason`
 * (`contracts/openapi/conversations.yaml`'s `FeedbackReason` enum:
 * INCORRECT / INCOMPLETE / OFF_TOPIC / OTHER).
 *
 * Moved here from `apps/web/src/lib/messages.ts`, which already had this
 * exact mapping, so that `apps/admin` (E11-S017/E13-S008's feedback
 * detail/list views, which render the raw `reason` code with no mapping
 * at all today) does not grow a second, hand-copied version of the same
 * four strings. A second copy would be a THIRD source of truth for these
 * four values — the contract enum is the first, this mapping is the
 * second — which is exactly what this wave otherwise spent its time
 * removing (E04-S071's fixture defect: someone filled the `reason` code
 * field with this mapping's *label* text, because no shared, obviously
 * singular definition of "code -> label" existed to point at instead).
 *
 * `apps/web`'s own `reason` values come from a literal-union picker (never
 * free text), so web never violated the contract; `apps/admin` receives
 * `reason` as a plain `string` from `contracts/openapi/analytics.yaml`'s
 * `FeedbackItem.reason` (widened past the enum on the analytics side), so
 * `getFeedbackReasonLabel` falls back to the raw string for anything not
 * in `FEEDBACK_REASON_LABELS` — including this app's own pre-existing
 * fixtures/tests that predate the enum and pass free text (e.g.
 * "回答完全解決問題") as `reason`. Falling back to the raw value for an
 * unrecognized code is a deliberate, narrow exception to "never show a
 * raw code" for exactly that reason: it is either legacy free text (show
 * it unchanged, as before) or a genuinely unknown code (show *something*
 * rather than silently drop the admin's only signal), never a case where
 * a good label was available and skipped.
 */

export const FEEDBACK_REASONS = ["INCORRECT", "INCOMPLETE", "OFF_TOPIC", "OTHER"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

export const FEEDBACK_REASON_LABELS: Record<FeedbackReason, string> = {
  INCORRECT: "答案不正確",
  INCOMPLETE: "答案不完整",
  OFF_TOPIC: "答案離題",
  OTHER: "其他",
};

function isFeedbackReason(value: string): value is FeedbackReason {
  return (FEEDBACK_REASONS as readonly string[]).includes(value);
}

/**
 * Renders any `reason` string (a known `FeedbackReason` code, or legacy/
 * unknown free text) as the Chinese label a human should read, falling
 * back to the input unchanged when it isn't a recognized code — see the
 * file doc comment for why that fallback exists rather than throwing or
 * rendering nothing.
 */
export function getFeedbackReasonLabel(reason: string): string {
  return isFeedbackReason(reason) ? FEEDBACK_REASON_LABELS[reason] : reason;
}
