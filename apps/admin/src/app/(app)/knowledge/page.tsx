import KnowledgeBaseList from "./_components/knowledge-base-list";

/**
 * E11-S011 "Knowledge admin" — thin route wrapper, same shape
 * roles/page.tsx (E11-S006) already establishes: the page itself owns
 * only the frame, KnowledgeBaseList owns the loading/error/empty/loaded
 * states.
 */
export default function KnowledgeAdminPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>知識庫管理</h1>
      <KnowledgeBaseList />
    </main>
  );
}
