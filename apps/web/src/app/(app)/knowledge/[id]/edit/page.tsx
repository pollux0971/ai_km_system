import EditKnowledgeBase from "./_components/edit-knowledge-base";

/**
 * E05-S004: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * conversations/[id]/page.tsx.
 */
export default async function EditKnowledgeBasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditKnowledgeBase id={id} />;
}
