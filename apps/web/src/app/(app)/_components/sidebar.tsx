"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@ai-km/ui";
import { useCurrentUser } from "@/lib/session-context";
import { visibleNavItems } from "@/lib/nav-items";
import { listActiveConversations, type ConversationSummary } from "@/lib/conversations";

/**
 * E01-S023: Material Symbols name per nav item, keyed by href — kept here
 * (not in nav-items.ts, which this story's boundary forbids touching) so
 * the icon choice stays a presentation concern of the sidebar itself.
 */
const NAV_ICON_NAMES: Record<string, string> = {
  "/": "home",
  "/conversations": "chat",
  "/knowledge": "menu_book",
  "/maintenance": "build",
  "/erp": "insights",
};

/**
 * E01-S006: nav items filtered by the current user's roles (see
 * apps/web/src/lib/nav-items.ts for the mapping and its rationale — this
 * is UX-only visibility, not a security boundary).
 *
 * ux/enterprise-polish adds two things:
 * - a prominent「開始新對話」entry (the same /conversations/new route the
 *   list page links to — it already auto-creates and redirects, so the
 *   sidebar button IS the ChatGPT-style "new chat" the user asked for);
 * - a scrollable「歷史對話」rail listing every unarchived conversation
 *   (listActiveConversations), most-recent first, with the currently-open
 *   conversation highlighted via aria-current.
 *
 * The history rail refetches whenever the pathname changes: the (app)
 * layout — and therefore this component — survives client-side navigation
 * without remounting, so a plain mount-only fetch would go stale the
 * moment a new conversation is created. Every create/delete/archive flow
 * ends in a navigation, so keying the fetch on pathname covers them; an
 * in-place rename on the detail page stays stale until the next
 * navigation, an accepted quick-access-rail tradeoff (the /conversations
 * management page remains the always-fresh source).
 */
export default function Sidebar() {
  const user = useCurrentUser();
  const pathname = usePathname();
  const items = visibleNavItems(user.roles);
  const [history, setHistory] = useState<ConversationSummary[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    listActiveConversations().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setHistory(result.value);
        setHistoryFailed(false);
      } else {
        setHistoryFailed(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function isCurrentNavItem(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="app-sidebar">
      {/* Brand lives in the header (E01-S005) — repeating it here would
          just duplicate the text one landmark away. */}
      <Link href="/conversations/new" className="sidebar-new-chat">
        <Icon name="add" />
        <span>開始新對話</span>
      </Link>

      <nav aria-label="主導覽">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} aria-current={isCurrentNavItem(item.href) ? "page" : undefined}>
                <Icon name={NAV_ICON_NAMES[item.href] ?? "circle"} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav aria-label="歷史對話" className="sidebar-history">
        <p className="sidebar-history-title">歷史對話</p>
        {historyFailed ? (
          <p className="sidebar-empty">無法載入對話。</p>
        ) : history === null ? null : history.length === 0 ? (
          <p className="sidebar-empty">尚無對話。</p>
        ) : (
          <ul>
            {history.map((conversation) => {
              const href = `/conversations/${conversation.id}`;
              return (
                <li key={conversation.id} className="sidebar-history-item">
                  <Link
                    href={href}
                    title={conversation.title}
                    aria-current={pathname === href ? "page" : undefined}
                    className="sidebar-history-link"
                  >
                    <Icon name="chat_bubble" />
                    <span className="sidebar-history-headline">{conversation.title}</span>
                  </Link>
                  <p className="sidebar-history-preview">{conversation.lastMessagePreview}</p>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}
