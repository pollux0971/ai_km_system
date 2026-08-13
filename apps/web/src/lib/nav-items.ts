import type { Role } from "@ai-km/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** "all" = every authenticated role; otherwise the exact allow-list. */
  roles: Role[] | "all";
}

/**
 * E01-S006: nav item -> role mapping. This is UX-only visibility (per
 * packages/permissions and the Frontend/UX Boundary — "UI permission
 * hiding 只屬 UX,不可作為 security control"), never the real
 * authorization boundary; that requires E02, which doesn't exist yet.
 *
 * The role assignments below aren't invented — they're read directly off
 * SOURCE_BASELINE.md §7's role descriptions ("Maintenance Engineer 使用:
 * Maintenance Assistant..." / "Sales / Purchasing 使用: ERP Assistant...").
 * Routes for /conversations, /knowledge, /maintenance, /erp don't exist
 * yet — each is created by its owning epic's own first story
 * (E03/E05/E07/E09-S001) — linking to them now is an entry point per the
 * MVP baseline ("所有核心功能都有入口"), not a claim that the page exists.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", roles: "all" },
  { href: "/conversations", label: "對話", roles: "all" },
  { href: "/knowledge", label: "知識庫", roles: "all" },
  { href: "/maintenance", label: "維修助手", roles: ["maintenance_engineer", "super_administrator"] },
  { href: "/erp", label: "ERP 助手", roles: ["sales_purchasing", "super_administrator"] },
];

export function visibleNavItems(userRoles: string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.some((role) => userRoles.includes(role)));
}
