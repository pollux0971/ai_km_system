import DocumentFailureList from "./_components/document-failure-list";

/**
 * E11-S018 "Document failure queue" — thin route wrapper, same shape
 * audit/page.tsx (E11-S015) already establishes: the page itself owns
 * only the frame, DocumentFailureList owns the loading/error/empty/
 * loaded states.
 */
export default function DocumentFailuresPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>文件失敗佇列</h1>
      <DocumentFailureList />
    </main>
  );
}
