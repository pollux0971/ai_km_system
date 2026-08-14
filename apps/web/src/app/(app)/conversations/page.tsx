import Link from "next/link";
import ConversationList from "./_components/conversation-list";

/**
 * E03-S001: the conversation list route (nav-items.ts's "/conversations"
 * entry, established as an entry point back in E01-S006 before this
 * page existed — that comment already anticipated this story building
 * it). Page frame only; ConversationList owns the loading/error/empty/
 * loaded states.
 *
 * E03-S028 adds a second, clearly-distinct entry link
 * ("上傳檔案開始對話") alongside "開始新對話" — see
 * conversations/new-file/page.tsx's own doc comment for why this is a
 * separate route rather than a retrofit of /conversations/new.
 */
export default function ConversationsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>對話</h1>
      <p>
        <Link href="/conversations/new">開始新對話</Link>
        {" · "}
        <Link href="/conversations/new-file">上傳檔案開始對話</Link>
      </p>
      <ConversationList />
    </main>
  );
}
