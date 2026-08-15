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
 * No "開始新的維修診斷" entry link yet — E07-S002 "Equipment selector"
 * is the first step of that flow and doesn't exist as a route yet;
 * same "don't invent a link to a route that isn't there" restraint
 * KnowledgeList (E05-S001) already applied to its own unlinked items
 * until E05-S005 built the target.
 */
export default function MaintenancePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>維修助手</h1>
      <MaintenanceCaseList />
    </main>
  );
}
