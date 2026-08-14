import KnowledgeFolderSyncEditor from "./_components/knowledge-folder-sync-editor";

/**
 * E05-S016: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/model/page.tsx (E05-S009) and its own siblings.
 */
export default async function KnowledgeFolderSyncPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeFolderSyncEditor id={id} />;
}
