import Link from "next/link";
import UserList from "./_components/user-list";

/**
 * E11-S002 "User list" — thin route wrapper, same shape apps/web's own
 * erp/page.tsx (E09-S001) and maintenance/page.tsx (E07-S001) already
 * establish: the page itself owns only the frame, UserList owns the
 * loading/error/empty/loaded states.
 *
 * E11-S004 "Create user" adds the "建立使用者" entry link to /users/new —
 * same relationship erp/page.tsx's own doc comment establishes between
 * E09-S001 and E09-S002's "開始新的 ERP 查詢" link.
 */
export default function UsersPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>使用者管理</h1>
      <p>
        <Link href="/users/new">建立使用者</Link>
      </p>
      <UserList />
    </main>
  );
}
