import Link from "next/link";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";

/**
 * E11-S001 "Admin dashboard" — apps/admin's bootstrap root page. It grew
 * one entry link per approved story, in this order: E11-S002 使用者管理
 * (/users), E11-S006 角色管理 (/roles), E11-S008 權限矩陣 (/permissions),
 * E11-S009 部門管理 (/departments), E11-S010 群組管理 (/groups), E11-S011
 * 知識庫管理 (/knowledge), E11-S012 提示詞管理 (/prompts), E11-S013 模型管理
 * (/models), E11-S014 連接器管理 (/connectors), E11-S015 稽核紀錄 (/audit),
 * E11-S016 回饋佇列 (/feedback), E11-S018 文件失敗佇列 (/document-failures),
 * E11-S020 系統設定 (/settings), E11-S021 使用量儀表板 (/usage), E11-S022
 * 系統健康儀表板 (/health), E13-S013 延遲儀表板 (/latency) — each added only
 * once its route actually existed, never invented ahead of time.
 *
 * ux/admin-ui-overhaul: those same 16 entries (now sourced from
 * ADMIN_NAV_GROUPS, shared with AdminSidebar) render as grouped entry
 * cards instead of a flat link column. Every href/label pair is
 * unchanged — the accessible name of each entry link is still exactly
 * its original label (descriptions live outside the <a>), so every
 * story's own frozen link assertion keeps holding.
 */
export default function AdminHomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>AI KM 管理主控台</h1>
      <p>企業知識管理平台的後台管理入口。</p>
      {ADMIN_NAV_GROUPS.map((group) => (
        <section key={group.title} className="entry-group">
          <h2>{group.title}</h2>
          <ul className="entry-grid">
            {group.items.map((item) => (
              <li key={item.href} className="entry-card">
                <Link href={item.href}>{item.label}</Link>
                <p>{item.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
