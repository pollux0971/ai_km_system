import KnowledgeMemberEditor from "./_components/knowledge-member-editor";

/**
 * E05-S007: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the split already established by
 * knowledge/[id]/permissions/page.tsx (E05-S006) and its own siblings.
 */
export default async function KnowledgeMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KnowledgeMemberEditor id={id} />;
}
