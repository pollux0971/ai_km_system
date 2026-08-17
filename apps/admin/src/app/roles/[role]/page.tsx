import RoleEditor from "./_components/role-editor";

/**
 * E11-S007 "Role editor" — thin route wrapper, same shape
 * users/[id]/page.tsx (E11-S003) already establishes: the page owns the
 * route param extraction + frame, RoleEditor owns the
 * loading/error/not-found/loaded states and the edit form itself.
 */
export default async function RoleEditorPage({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;

  return (
    <main style={{ padding: 32 }}>
      <RoleEditor role={role} />
    </main>
  );
}
