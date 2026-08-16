import UserDetail from "./_components/user-detail";

/**
 * E11-S003 "User detail" — thin route wrapper, same shape
 * users/page.tsx (E11-S002) and apps/web's own detail routes already
 * establish: the page owns the id extraction + frame, UserDetail owns
 * the loading/error/not-found/loaded states.
 */
export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main style={{ padding: 32 }}>
      <UserDetail userId={id} />
    </main>
  );
}
