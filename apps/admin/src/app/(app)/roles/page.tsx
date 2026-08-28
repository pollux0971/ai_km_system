import RoleList from "./_components/role-list";

/**
 * E11-S006 "Role list" — thin route wrapper, same shape users/page.tsx
 * (E11-S002) already establishes: the page itself owns only the frame,
 * RoleList owns the loading/error/empty/loaded states.
 */
export default function RolesPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>角色管理</h1>
      <RoleList />
    </main>
  );
}
