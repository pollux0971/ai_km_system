"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";

/**
 * ux/admin-ui-overhaul: persistent admin navigation — collapsible groups
 * (native <details>/<summary>, all open by default: zero state to manage,
 * keyboard/AT support for free) over ADMIN_NAV_GROUPS, with the current
 * route highlighted via aria-current, same convention apps/web's own
 * Sidebar (E01-S006 + ux/enterprise-polish) established.
 *
 * Deliberately NOT role-filtered: apps/admin has no session source yet
 * (see AdminRouteGuard's doc comment, E11-S023) — there is no user to
 * filter by. When a real session exists, visibility filtering belongs
 * here and enforcement stays in AdminRouteGuard, mirroring apps/web's
 * visibleNavItems (UX) vs RoleGuard (security) split.
 */
export default function AdminSidebar() {
  const pathname = usePathname();

  function isCurrent(href: string): boolean {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="app-sidebar">
      <Link href="/" className="sidebar-home" aria-current={pathname === "/" ? "page" : undefined}>
        管理主控台
      </Link>

      <nav aria-label="管理導覽">
        {ADMIN_NAV_GROUPS.map((group) => (
          <details key={group.title} open className="sidebar-group">
            <summary>{group.title}</summary>
            <ul>
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isCurrent(item.href) ? "page" : undefined}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </nav>
    </div>
  );
}
