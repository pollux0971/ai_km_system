import GroupManagement from "./_components/group-management";

/**
 * E11-S010 "Group management" — thin route wrapper, same shape
 * departments/page.tsx (E11-S009) already establishes: the page itself
 * owns only the frame, GroupManagement owns the loading/error/loaded
 * states and the create form.
 */
export default function GroupsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>群組管理</h1>
      <GroupManagement />
    </main>
  );
}
