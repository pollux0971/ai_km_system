import Link from "next/link";
import ConversationList from "./_components/conversation-list";

/**
 * E03-S001: the conversation list route (nav-items.ts's "/conversations"
 * entry, established as an entry point back in E01-S006 before this
 * page existed — that comment already anticipated this story building
 * it). Page frame only; ConversationList owns the loading/error/empty/
 * loaded states.
 */
export default function ConversationsPage() {
  return (
    <main style={{ padding: 32 }}>
      <h1>對話</h1>
      <p>
        <Link href="/conversations/new">開始新對話</Link>
      </p>
      <ConversationList />
    </main>
  );
}
