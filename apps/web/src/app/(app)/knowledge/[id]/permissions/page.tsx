import KnowledgePermissionEditor from "./_components/knowledge-permission-editor";

/**
 * E05-S006: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/page.tsx (E05-S005) and knowledge/[id]/edit/page.tsx
 * (E05-S004).
 */
export default async function KnowledgePermissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgePermissionEditor id={id} />;
}
