import KnowledgeDetail from "./_components/knowledge-detail";

/**
 * E05-S005: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * conversations/[id]/page.tsx and this story's own sibling
 * knowledge/[id]/edit/page.tsx (E05-S004).
 */
export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeDetail id={id} />;
}
