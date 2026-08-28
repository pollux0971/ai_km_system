"use client";

import { useConversationConnectionStatus } from "@/lib/conversation-events-context";
import NotificationCenter from "./notification-center";
import UserMenu from "./user-menu";

/**
 * E01-S005: header bar — branding + user-menu. E01-S014 adds the
 * notification center. E01-S023 adds the M3 top-app-bar treatment
 * (`app-header--m3` — see globals.css's `/* ---- M3 shell ---- *\/`
 * section); no DOM/text/role change.
 *
 * E03-S039 adds the cross-window sync status indicator. The `aria-live`
 * region is always present in the DOM (never conditionally mounted) with
 * empty text when not reconnecting — an aria-live region only reliably
 * announces mutations to content it already contains; mounting a brand
 * new live region at the exact moment the message appears is not a
 * dependable way to get it announced. `useConversationConnectionStatus()`
 * reads `null` outside any `ConversationEventsProvider` (e.g. this
 * component's own pre-existing unit test, which renders `<Header>` with
 * only a `CurrentUserProvider`) — `null !== "reconnecting"`, so the
 * indicator silently stays empty rather than requiring every existing
 * render site to add a provider it doesn't otherwise need.
 */
export default function Header() {
  const status = useConversationConnectionStatus();

  return (
    <header className="app-header app-header--m3">
      <span className="app-header-brand">AI KM</span>
      <div aria-live="polite" className="app-header-sync-status">
        {status === "reconnecting" ? "同步連線中斷，重新連線中…" : null}
      </div>
      <div className="app-header-actions">
        <NotificationCenter />
        <UserMenu />
      </div>
    </header>
  );
}
