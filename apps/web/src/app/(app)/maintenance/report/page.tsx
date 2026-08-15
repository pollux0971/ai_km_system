import MaintenanceReport from "./_components/maintenance-report";

/**
 * E07-S022: the maintenance report route. Page frame only;
 * MaintenanceReport owns the loading/error/loaded states, same division
 * of responsibility MaintenancePage (E07-S001) already has with
 * MaintenanceCaseList.
 */
export default function MaintenanceReportPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>維修報表</h1>
      <MaintenanceReport />
    </main>
  );
}
