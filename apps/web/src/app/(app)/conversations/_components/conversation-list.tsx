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
 *
 * E03-S023 "Conversation search" adds `query`, searched on every
 * keystroke (no debounce, no submit button) — this mock's "search" is
 * an instant in-memory array filter (see listConversations), not a
 * real network call with latency worth debouncing against; adding
 * debounce logic for a cost that doesn't exist here would be
 * unrequested complexity, not simplification. The search input is
 * rendered UNCONDITIONALLY, outside every `state.status` branch below
 * it, so it stays visible (and keeps whatever the user already typed)
 * through loading/error/empty renders — a page reload while searching
 * shouldn't hide the box the user is actively typing into.
 *
 * Changing `query` also resets `page` back to 1 (handleQueryChange) —
 * without this, searching while on page 2 of the unfiltered list could
 * land on a page number beyond the filtered result set's own last
 * page, showing an empty page 2 of 1 rather than the actual matches.
 *
 * The empty-state message branches on `query.trim()` (not raw `query`)
 * — mirroring listConversations' own trim exactly, so a whitespace-only
 * search reads as "no search active" on both sides, not just the data
 * layer. An empty *search* result ("查無符合...的對話") is a materially
 * different situation from a genuinely empty conversation list ("尚無
 * 對話，開始你的第一個對話") — reusing the "start your first
 * conversation" message would be actively misleading to a user who has
 * conversations but just searched for something that doesn't match any
 * of them.
 */
export default function ConversationList() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    setState({ status: "loading" });
    logger.info("loading conversation list", { correlationId, page, query });

    listConversations(page, query).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load conversation list", { correlationId, page, query, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("conversation list loaded", { correlationId, page, query, count: result.value.items.length, totalCount: result.value.totalCount });
      setState({ status: "loaded", items: result.value.items, page: result.value.page, totalPages: result.value.totalPages });
    });

    return () => {
      cancelled = true;
    };
  }, [page, query]);

  function handleQueryChange(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="conversation-search">搜尋對話</label>
        <br />
        <input
          id="conversation-search"
          type="search"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          placeholder="輸入對話標題關鍵字…"
        />
      </div>

      {state.status === "loading" && <LoadingIndicator />}

      {state.status === "error" && <ErrorMessage message="無法載入對話列表。" />}

      {state.status === "loaded" && state.items.length === 0 && state.page === 1 && (
        <EmptyState message={query.trim() ? `查無符合「${query}」的對話。` : "尚無對話，開始你的第一個對話。"} />
      )}

      {state.status === "loaded" && state.items.length > 0 && (
        <>
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
        </>
      )}
    </div>
  );
}
