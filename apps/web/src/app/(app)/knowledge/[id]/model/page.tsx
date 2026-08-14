import KnowledgeModelEditor from "./_components/knowledge-model-editor";

/**
 * E05-S009: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/prompt/page.tsx (E05-S008) and its own siblings.
 */
export default async function KnowledgeModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeModelEditor id={id} />;
}
