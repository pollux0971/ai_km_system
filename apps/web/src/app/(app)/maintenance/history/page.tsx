import MaintenanceHistoryList from "./_components/maintenance-history-list";

/**
 * E07-S020: the maintenance history route. Reached from
 * /maintenance's own "查看維修歷史" link (see that page's own doc
 * comment) — same "/maintenance/* sub-route, no dedicated NAV_ITEMS
 * entry, inherits the parent's role restriction via nav-items.ts's own
 * prefix-matching" precedent /maintenance/new (E07-S002) and
 * /maintenance/[id]/session (E07-S006) already establish. Page frame
 * only; MaintenanceHistoryList owns the loading/error/empty/loaded
 * states, same division of responsibility MaintenancePage (E07-S001)
 * already has with MaintenanceCaseList.
 */
export default function MaintenanceHistoryPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>維修歷史</h1>
      <MaintenanceHistoryList />
    </main>
  );
}
