import DepartmentManagement from "./_components/department-management";

/**
 * E11-S009 "Department management" — thin route wrapper, same shape
 * roles/page.tsx (E11-S006) already establishes: the page itself owns
 * only the frame, DepartmentManagement owns the loading/error/loaded
 * states and the create form.
 */
export default function DepartmentsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>部門管理</h1>
      <DepartmentManagement />
    </main>
  );
}
