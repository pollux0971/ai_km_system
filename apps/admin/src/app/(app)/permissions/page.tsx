import PermissionMatrix from "./_components/permission-matrix";

/**
 * E11-S008 "Permission matrix" — thin route wrapper, same shape
 * roles/page.tsx (E11-S006) already establishes: the page itself owns
 * only the frame, PermissionMatrix owns the loading/error/empty/loaded
 * states.
 */
export default function PermissionsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>權限矩陣</h1>
      <PermissionMatrix />
    </main>
  );
}
