import UserList from "./_components/user-list";

/**
 * E11-S002 "User list" — thin route wrapper, same shape apps/web's own
 * erp/page.tsx (E09-S001) and maintenance/page.tsx (E07-S001) already
 * establish: the page itself owns only the frame, UserList owns the
 * loading/error/empty/loaded states.
 */
export default function UsersPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>使用者管理</h1>
      <UserList />
    </main>
  );
}
