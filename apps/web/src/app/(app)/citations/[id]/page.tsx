import { CitationSourceView } from "./_components/citation-source-view";

/**
 * E03-S015: thin Server Component wrapper unwrapping Next.js 15's async
 * `params`, matching the same split (server wrapper + client component)
 * already established for /conversations/[id]/page.tsx.
 */
export default async function CitationSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CitationSourceView id={id} />;
}
