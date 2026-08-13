import ConversationDetail from "./_components/conversation-detail";

/**
 * E03-S002: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the (public)/login/page.tsx split (server wrapper +
 * client component) already established in this codebase.
 */
export default async function ConversationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConversationDetail id={id} />;
}
