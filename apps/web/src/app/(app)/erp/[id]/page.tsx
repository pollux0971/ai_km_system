import ErpQueryDetail from "./_components/erp-query-detail";

/**
 * E09-S002: the ERP query detail route. Thin Server Component wrapper
 * unwrapping Next.js 15's async `params`, same split
 * maintenance/[id]/page.tsx (E07-S021) already established.
 * ErpQueryDetail owns the loading/error/not-found/loaded states, same
 * division of responsibility ErpPage (E09-S001) already has with
 * ErpQueryList. A sibling of the static /erp/new segment — Next's own
 * App Router resolves this and /erp/new without ambiguity (static
 * segments always take priority over a dynamic one at the same level).
 */
export default async function ErpQueryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ErpQueryDetail id={id} />;
}
