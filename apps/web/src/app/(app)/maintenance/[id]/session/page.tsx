import MaintenanceSession from "./_components/maintenance-session";

/**
 * E07-S006: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/page.tsx (E05-S005) and conversations/[id]/page.tsx.
 */
export default async function MaintenanceSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MaintenanceSession id={id} />;
}
