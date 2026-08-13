import { colors, spacing } from "@ai-km/design-tokens";

/**
 * E01-S011: unified loading indicator for async content regions —
 * replaces the ad-hoc "載入中…" text each story had been writing
 * independently (E01-S004's SessionGate, E01-S008's RecentConversations).
 * Deliberately does NOT cover button pending-label states (LoginForm's
 * "登入中…", UserMenu's "登出中…") — those are a different UI concern
 * (a control's own busy state, not a content region loading), out of
 * this story's scope.
 */
export function LoadingIndicator({ label = "載入中…" }: { label?: string } = {}) {
  return <p role="status">{label}</p>;
}

/**
 * E01-S011: a single content-shaped placeholder bar. Compose several to
 * suggest the shape of not-yet-loaded content (a list, a paragraph).
 * Marked aria-hidden — it's purely visual; wrap in a role="status"
 * container (or use LoadingIndicator) for the accessible loading
 * announcement.
 */
export function SkeletonBar({ width = "100%" }: { width?: string | number } = {}) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width,
        height: 14,
        marginBottom: spacing.xs,
        borderRadius: 4,
        background: colors.muted,
      }}
    />
  );
}
