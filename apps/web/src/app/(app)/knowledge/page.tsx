import Link from "next/link";
import KnowledgeList from "./_components/knowledge-list";

/**
 * E05-S001: the knowledge base list route (nav-items.ts's "/knowledge"
 * entry, established as an entry point back in E01-S006 before this
 * page existed — that comment already anticipated this story building
 * it, same as E03-S001 did for "/conversations"). Page frame only;
 * KnowledgeList owns the loading/error/empty/loaded states.
 *
 * E05-S003 adds the "新增知識庫" entry link to /knowledge/new — the
 * capability E05-S001 deliberately deferred to its own separate story,
 * mirroring conversations/page.tsx's "開始新對話" link.
 */
export default function KnowledgePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>知識庫</h1>
      <p>
        <Link href="/knowledge/new">新增知識庫</Link>
      </p>
      <KnowledgeList />
    </main>
  );
}
