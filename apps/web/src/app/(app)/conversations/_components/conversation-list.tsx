"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listConversations, type ConversationSummary } from "@/lib/conversations";

const logger = createLogger("web:conversation-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: ConversationSummary[]; page: number; totalPages: number };

/**
 * E03-S001: the full conversation list — distinct from the Home
 * Dashboard's Recent Conversations widget (E01-S008, top 3 only).
 * Items link to /conversations/[id] (E03-S002) — deferred at E03-S001
 * ("inventing a link to a route that isn't there yet would just be a
 * dead link"), now fulfilled since that route exists.
 *
 * E03-S022 "Conversation history pagination" adds `page` as its own
 * piece of state (not folded into the fetch effect's dependency array
 * as a URL/route param — nothing in this story asks for the page to be
 * shareable/bookmarkable via the URL, and inventing that is out of
 * scope). Changing pages goes back through the same "loading" status
 * the initial load uses, rather than a separate "switching pages"
 * status — MVP 可以簡化視覺, and there's no established precedent
 * elsewhere in this codebase for a distinct paginate-in-place loading
 * treatment. Prev/next buttons (not numbered page links) are the
 * simplest UI that fully covers "browse all pages" without needing to
 * render a variable-length row of page-number buttons.
 */
export default function ConversationList() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    setState({ status: "loading" });
    logger.info("loading conversation list", { correlationId, page });

    listConversations(page).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load conversation list", { correlationId, page, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("conversation list loaded", { correlationId, page, count: result.value.items.length, totalCount: result.value.totalCount });
      setState({ status: "loaded", items: result.value.items, page: result.value.page, totalPages: result.value.totalPages });
    });

    return () => {
      cancelled = true;
    };
  }, [page]);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入對話列表。" />;
  }

  if (state.items.length === 0 && state.page === 1) {
    return <EmptyState message="尚無對話，開始你的第一個對話。" />;
  }

  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {state.items.map((item) => (
          <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
            <Link href={`/conversations/${item.id}`}>
              <strong>{item.title}</strong>
            </Link>
            <br />
            <span>{item.lastMessagePreview}</span>
            <br />
            <time dateTime={item.lastMessageAt}>{new Date(item.lastMessageAt).toLocaleString("zh-TW")}</time>
          </li>
        ))}
      </ul>
      {state.totalPages > 1 && (
        <nav aria-label="對話列表分頁">
          <button type="button" onClick={() => setPage((current) => current - 1)} disabled={state.page <= 1}>
            上一頁
          </button>
          <span>
            第 {state.page} 頁，共 {state.totalPages} 頁
          </span>
          <button type="button" onClick={() => setPage((current) => current + 1)} disabled={state.page >= state.totalPages}>
            下一頁
          </button>
        </nav>
      )}
    </div>
  );
}
