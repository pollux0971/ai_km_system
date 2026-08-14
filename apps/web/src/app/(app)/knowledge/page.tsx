import KnowledgeList from "./_components/knowledge-list";

/**
 * E05-S001: the knowledge base list route (nav-items.ts's "/knowledge"
 * entry, established as an entry point back in E01-S006 before this
 * page existed — that comment already anticipated this story building
 * it, same as E03-S001 did for "/conversations"). Page frame only;
 * KnowledgeList owns the loading/error/empty/loaded states.
 *
 * No "create new knowledge base" link here — unlike E03-S001 (which
 * bundled list and create into one story), SOURCE_BASELINE.md's E05
 * outline gives "Create KB" its own separate story (E05-S03); adding an
 * entry point for a capability a later story owns would be reaching
 * ahead of this story's own scope.
 */
export default function KnowledgePage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>知識庫</h1>
      <KnowledgeList />
    </main>
  );
}
