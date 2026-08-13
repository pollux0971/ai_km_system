"use client";

import { useCurrentUser } from "@/lib/session-context";
import RecentConversations from "./_components/recent-conversations";
import QuickEntryCards from "./_components/quick-entry-cards";

/**
 * E01-S007 home dashboard thin slice: the page frame + a greeting.
 * "最近對話" is E01-S008's widget; "快速入口" is E01-S009's — both now
 * filled in, completing the skeleton E01-S001→S002/E01-S005→S006
 * established this pattern with.
 */
export default function HomePage() {
  const user = useCurrentUser();

  return (
    <main style={{ padding: 32 }}>
      <h1>歡迎回來</h1>
      <p>{user.userId}，這是你的工作台首頁。</p>

      <section aria-labelledby="recent-conversations-heading" style={{ marginTop: 32 }}>
        <h2 id="recent-conversations-heading">最近對話</h2>
        <RecentConversations />
      </section>

      <section aria-labelledby="quick-entry-heading" style={{ marginTop: 32 }}>
        <h2 id="quick-entry-heading">快速入口</h2>
        <QuickEntryCards />
      </section>
    </main>
  );
}
