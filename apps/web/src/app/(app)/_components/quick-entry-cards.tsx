"use client";

import Link from "next/link";
import { EmptyState, Icon } from "@ai-km/ui";
import { useCurrentUser } from "@/lib/session-context";
import { visibleEntryCards } from "@/lib/nav-items";

/**
 * E01-S009: Home Dashboard's Knowledge/Maintenance/ERP entry cards.
 * Reuses E01-S006's nav-items table so a role that can't see an item in
 * the sidebar never sees a matching card here either — one source of
 * truth for "what can this user reach," not two that could drift.
 *
 * E01-S024: M3 filled card tiles. The icon mapping is keyed by href (not
 * added to `nav-items.ts` itself, which is outside this story's
 * allowed-modify list) — a decorative `<Icon>` living entirely inside
 * this component, `aria-hidden` by default (no `label` prop), so it
 * never changes the link's accessible name.
 */
const ENTRY_ICON_BY_HREF: Record<string, string> = {
  "/knowledge": "menu_book",
  "/maintenance": "build",
  "/erp": "insights",
};

export default function QuickEntryCards() {
  const user = useCurrentUser();
  const cards = visibleEntryCards(user.roles);

  if (cards.length === 0) {
    return <EmptyState message="目前沒有可用的快速入口。" />;
  }

  return (
    <ul className="home-tile-grid">
      {cards.map((card) => (
        <li key={card.href}>
          <Link href={card.href} className="home-tile-card">
            <Icon name={ENTRY_ICON_BY_HREF[card.href] ?? "apps"} size={32} />
            <strong className="home-tile-title">{card.label}</strong>
            <p className="home-tile-description">{card.entryCardDescription}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
