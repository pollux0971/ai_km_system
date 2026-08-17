import Link from "next/link";

/**
 * E11-S001 "Admin dashboard" — apps/admin's own bootstrap root page,
 * mirroring apps/web's own E01-S001 in scope: route skeleton + a bare
 * landing page, deliberately not yet gated by any session/authorization
 * check (that's E11-S023 "admin route authorization", the direct
 * counterpart of apps/web's RoleGuard from E01-S017 — apps/web itself
 * shipped a full 16 stories, S002 through S016, before RoleGuard existed
 * at S017, so deferring it here past S001 is the same, already-approved
 * sequencing this codebase's own web app already used).
 *
 * Unlike apps/web's own root page (which stayed a content-free scaffold
 * until E01-S008's later dedicated "Home dashboard" story), this page's
 * own title already is "Admin dashboard" — there's no separate future
 * E11 story reserved for turning a placeholder into real dashboard
 * content. So this establishes the actual page real content lives on,
 * not a placeholder deferring to an unnamed future story: later E11
 * stories (user list, role list, audit viewer, ...) are expected to
 * enrich this page with their own summary/entry content the same
 * additive way erp/page.tsx (E09-S001) grew its own "開始新的 ERP 查詢"
 * link only once E09-S002 actually existed — not invented ahead of time
 * here, since none of those sections' own data models exist yet.
 *
 * E11-S002 "User list" was the first of these — added the "使用者管理"
 * entry link once /users existed. E11-S006 "Role list" adds "角色管理"
 * the same way, now that /roles exists too. E11-S008 "Permission
 * matrix" adds "權限矩陣" the same way, now that /permissions exists.
 */
export default function AdminHomePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>AI KM 管理主控台</h1>
      <p>企業知識管理平台的後台管理入口。</p>
      <p>
        <Link href="/users">使用者管理</Link>
      </p>
      <p>
        <Link href="/roles">角色管理</Link>
      </p>
      <p>
        <Link href="/permissions">權限矩陣</Link>
      </p>
    </main>
  );
}
