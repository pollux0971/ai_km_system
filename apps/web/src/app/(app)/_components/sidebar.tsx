"use client";

import Link from "next/link";
import { useCurrentUser } from "@/lib/session-context";
import { visibleNavItems } from "@/lib/nav-items";

/**
 * E01-S006: nav items filtered by the current user's roles (see
 * apps/web/src/lib/nav-items.ts for the mapping and its rationale — this
 * is UX-only visibility, not a security boundary). E01-S005 shipped this
 * with a single static "首頁" item; this story replaces that with the
 * real role-aware list, which is why it's now a Client Component (needs
 * useCurrentUser()).
 */
export default function Sidebar() {
  const user = useCurrentUser();
  const items = visibleNavItems(user.roles);

  return (
    <nav aria-label="主導覽" style={{ width: 220, flexShrink: 0, borderRight: "1px solid #e5e5e5", padding: 16 }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href}>{item.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
