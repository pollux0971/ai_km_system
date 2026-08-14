import KnowledgePromptEditor from "./_components/knowledge-prompt-editor";

/**
 * E05-S008: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/members/page.tsx (E05-S007) and its own siblings.
 */
export default async function KnowledgePromptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgePromptEditor id={id} />;
}
