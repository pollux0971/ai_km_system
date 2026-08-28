import type { ReactNode } from "react";

/**
 * E01-S013: unified empty-state presentation — replaces ad-hoc
 * "尚無…" text scattered per-component (E01-S008's RecentConversations,
 * E01-S009's QuickEntryCards). Deliberately plain (no color/icon) —
 * an empty state is informational, not alarming, unlike ErrorMessage's
 * danger-colored treatment; same plain visual register as
 * LoadingIndicator, which this and E01-S012's ErrorMessage complete the
 * loading/error/empty trio alongside.
 *
 * E01-S026: optional `illustration` prop — purely decorative
 * (`aria-hidden`), so text stays the primary message; omitted entirely
 * (no wrapper) when not given, matching the original plain-text render.
 */
export function EmptyState({
  message,
  children,
  illustration,
}: { message?: string; children?: ReactNode; illustration?: ReactNode } = {}) {
  const text = <p>{children ?? message ?? "目前沒有內容。"}</p>;
  if (!illustration) return text;
  return (
    <div>
      <span aria-hidden="true">{illustration}</span>
      {text}
    </div>
  );
}
