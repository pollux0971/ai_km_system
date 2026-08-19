/**
 * ux/admin-ui-overhaul: the single source for the admin console's grouped
 * navigation — consumed by both AdminSidebar (collapsible groups) and the
 * home page's entry-card grid, so the two can never drift apart.
 *
 * Every href/label pair here predates this file: they are the exact 16
 * entry links the home page accumulated story by story (E11-S002 through
 * E13-S013 — see page.tsx's doc comment for that history). This file only
 * adds grouping and a one-line description per entry; it does not invent
 * any new route. Grouping is UX-only wayfinding, not a security boundary —
 * actual route authorization is E11-S023's AdminRouteGuard (structural,
 * deliberately unwired until a real session source exists).
 */

export type AdminNavItem = {
  href: string;
  label: string;
  description: string;
};

export type AdminNavGroup = {
  title: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "身分與權限",
    items: [
      { href: "/users", label: "使用者管理", description: "檢視使用者帳號、角色指派與啟用狀態。" },
      { href: "/roles", label: "角色管理", description: "檢視系統角色與各自的職責說明。" },
      { href: "/permissions", label: "權限矩陣", description: "檢視各角色對系統能力的授權對照。" },
      { href: "/departments", label: "部門管理", description: "維護部門清單並新增組織部門。" },
      { href: "/groups", label: "群組管理", description: "維護使用者群組並新增授權群組。" },
    ],
  },
  {
    title: "知識與內容",
    items: [
      { href: "/knowledge", label: "知識庫管理", description: "檢視知識庫清單與其存取範圍。" },
      { href: "/prompts", label: "提示詞管理", description: "建立與維護系統提示詞範本。" },
      { href: "/models", label: "模型管理", description: "檢視並啟停可用的推論模型。" },
      { href: "/connectors", label: "連接器管理", description: "檢視並啟停外部資料連接器。" },
    ],
  },
  {
    title: "維運佇列",
    items: [
      { href: "/audit", label: "稽核紀錄", description: "檢視系統稽核事件軌跡。" },
      { href: "/feedback", label: "回饋佇列", description: "檢視使用者對回答的回饋與統計。" },
      { href: "/document-failures", label: "文件失敗佇列", description: "檢視文件處理失敗項目並重試。" },
    ],
  },
  {
    title: "分析儀表板",
    items: [
      { href: "/usage", label: "使用量儀表板", description: "檢視 DAU 與提問量等使用指標。" },
      { href: "/health", label: "系統健康儀表板", description: "檢視各子系統的健康狀態。" },
      { href: "/latency", label: "延遲儀表板", description: "檢視回應延遲指標。" },
    ],
  },
  {
    title: "系統",
    items: [{ href: "/settings", label: "系統設定", description: "管理全系統層級的設定選項。" }],
  },
];
