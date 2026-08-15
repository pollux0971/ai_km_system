import Link from "next/link";
import MaintenanceCaseList from "./_components/maintenance-case-list";

/**
 * E07-S001: the maintenance home route (nav-items.ts's "/maintenance"
 * entry, established back in E01-S006/S009 as an entry point before
 * this page existed — role-gated to maintenance_engineer/
 * super_administrator via the global RoleGuard in
 * apps/web/src/app/(app)/layout.tsx, so this page itself needs no
 * additional authorization wiring of its own). Page frame only;
 * MaintenanceCaseList owns the loading/error/empty/loaded states.
 *
 * E07-S002 "Equipment selector" adds the "開始新的維修診斷" entry link
 * to /maintenance/new — the capability E07-S001 deliberately deferred
 * to its own separate story, same relationship knowledge/page.tsx
 * (E05-S001) already has with knowledge/new/page.tsx (E05-S003).
 */
export default function MaintenancePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>維修助手</h1>
      <p>
        <Link href="/maintenance/new">開始新的維修診斷</Link>
      </p>
      <MaintenanceCaseList />
    </main>
  );
}
