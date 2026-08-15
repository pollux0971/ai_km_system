import Link from "next/link";
import MaintenanceCaseList from "./_components/maintenance-case-list";
import ContinueDiagnosisPrompt from "./_components/continue-diagnosis-prompt";

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
 *
 * E07-S020 "Maintenance history" adds the second entry link,
 * "查看維修歷史", to /maintenance/history — same relationship, a second
 * sub-route this page deliberately deferred until the story that
 * actually owns it existed.
 *
 * E07-S022 "Maintenance report view/export" adds a third entry link,
 * "查看維修報表", to /maintenance/report — same relationship again.
 *
 * E07-S024 "Session-resume UX" adds `ContinueDiagnosisPrompt` above the
 * entry links — a different relationship from the three links above:
 * not a link to a separate sub-route, but a self-contained component
 * that renders nothing of its own when there's nothing to resume (see
 * its own doc comment). Placed above 開始新的維修診斷 deliberately —
 * continuing existing work takes priority over starting something new
 * when there's active work to return to.
 */
export default function MaintenancePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>維修助手</h1>
      <ContinueDiagnosisPrompt />
      <p>
        <Link href="/maintenance/new">開始新的維修診斷</Link>
      </p>
      <p>
        <Link href="/maintenance/history">查看維修歷史</Link>
      </p>
      <p>
        <Link href="/maintenance/report">查看維修報表</Link>
      </p>
      <MaintenanceCaseList />
    </main>
  );
}
