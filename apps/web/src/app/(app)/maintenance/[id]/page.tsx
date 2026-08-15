import CaseDetail from "./_components/case-detail";

/**
 * E07-S021: the case detail route. Thin Server Component wrapper
 * unwrapping Next.js 15's async `params`, same split
 * maintenance/[id]/session/page.tsx (E07-S006) already established
 * (itself matching knowledge/[id]/page.tsx and conversations/[id]/page.tsx).
 * CaseDetail owns the loading/error/not-found/loaded states, same
 * division of responsibility MaintenancePage (E07-S001) already has with
 * MaintenanceCaseList. A sibling of /maintenance/[id]/session under the
 * same [id] dynamic segment — Next's own App Router resolves this and
 * the static /maintenance/new, /maintenance/history segments without any
 * ambiguity (static segments always take priority over a dynamic one at
 * the same level).
 */
export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail id={id} />;
}
