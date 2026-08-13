import type { Role } from "@ai-km/permissions";

export interface NavItem {
  href: string;
  label: string;
  /** "all" = every authenticated role; otherwise the exact allow-list. */
  roles: Role[] | "all";
  /**
   * Present only for items E01-S009 renders as a Home Dashboard entry
   * card (Knowledge/Maintenance/ERP) — Home and Conversations are
   * reachable other ways (current page; S008's "查看全部對話" link) so
   * they don't get a card.
   */
  entryCardDescription?: string;
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
 *
 * E01-S009 reuses this same table (rather than a second, separate list)
 * for the Home Dashboard's entry cards, so a role that can't see
 * Maintenance in the sidebar never sees a Maintenance card either.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "首頁", roles: "all" },
  { href: "/conversations", label: "對話", roles: "all" },
  {
    href: "/knowledge",
    label: "知識庫",
    roles: "all",
    entryCardDescription: "瀏覽企業知識庫、文件與 FAQ。",
  },
  {
    href: "/maintenance",
    label: "維修助手",
    roles: ["maintenance_engineer", "super_administrator"],
    entryCardDescription: "設備故障排除、錯誤代碼與 SOP 查詢。",
  },
  {
    href: "/erp",
    label: "ERP 助手",
    roles: ["sales_purchasing", "super_administrator"],
    entryCardDescription: "以自然語言查詢 ERP 資料與報表。",
  },
];

export function visibleNavItems(userRoles: string[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles === "all" || item.roles.some((role) => userRoles.includes(role)));
}

export function visibleEntryCards(userRoles: string[]): NavItem[] {
  return visibleNavItems(userRoles).filter((item) => item.entryCardDescription !== undefined);
}
