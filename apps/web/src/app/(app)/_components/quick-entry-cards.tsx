"use client";

import Link from "next/link";
import { EmptyState } from "@ai-km/ui";
import { useCurrentUser } from "@/lib/session-context";
import { visibleEntryCards } from "@/lib/nav-items";

/**
 * E01-S009: Home Dashboard's Knowledge/Maintenance/ERP entry cards.
 * Reuses E01-S006's nav-items table so a role that can't see an item in
 * the sidebar never sees a matching card here either — one source of
 * truth for "what can this user reach," not two that could drift.
 */
export default function QuickEntryCards() {
  const user = useCurrentUser();
  const cards = visibleEntryCards(user.roles);

  if (cards.length === 0) {
    return <EmptyState message="目前沒有可用的快速入口。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 16, flexWrap: "wrap" }}>
      {cards.map((card) => (
        <li key={card.href}>
          <Link
            href={card.href}
            style={{
              display: "block",
              minWidth: 200,
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              padding: 16,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <strong>{card.label}</strong>
            <p style={{ margin: "4px 0 0" }}>{card.entryCardDescription}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
