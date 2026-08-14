"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listKnowledgeBases, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";

const logger = createLogger("web:knowledge-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: KnowledgeBaseSummary[] };

/**
 * E05-S001: the full knowledge base list.
 *
 * E05-S004 "Edit KB metadata" adds a distinct, explicitly-labeled "編輯"
 * link per item to /knowledge/{id}/edit.
 *
 * E05-S005 "KB detail page" links each item's name to /knowledge/{id} —
 * deferred at E05-S001 ("inventing a link to a route that isn't there
 * yet would just be a dead link"), now fulfilled since that route
 * exists, mirroring conversation-list.tsx's own item-name-to-detail
 * link exactly (E03-S001 deferred → E03-S002 fulfilled, same pattern).
 *

 * E05-S002 "Knowledge search/filter" adds `query`, searched on every
 * keystroke (no debounce — this mock's search is an instant in-memory
 * array filter, not a real network call with latency worth debouncing
 * against) — same design E03-S023 "Conversation search" already
 * established for conversation-list.tsx. The search input renders
 * UNCONDITIONALLY, outside every `state.status` branch, so it stays
 * visible (and keeps whatever the user already typed) through
 * loading/error/empty renders. The empty-state message branches on
 * `query.trim()` (mirroring listKnowledgeBases' own trim exactly) so a
 * genuinely empty knowledge base list ("尚無知識庫。") reads distinctly
 * from an empty *search* result ("查無符合...的知識庫。") — reusing one
 * message for both would misrepresent a search that just didn't match
 * anything as there being no knowledge bases at all.
 */
export default function KnowledgeList() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    setState({ status: "loading" });
    logger.info("loading knowledge base list", { correlationId, query });

    listKnowledgeBases(query).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load knowledge base list", { correlationId, query, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("knowledge base list loaded", { correlationId, query, count: result.value.length });
      setState({ status: "loaded", items: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label htmlFor="knowledge-search">搜尋知識庫</label>
        <br />
        <input
          id="knowledge-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="輸入知識庫名稱關鍵字…"
        />
      </div>

      {state.status === "loading" && <LoadingIndicator />}

      {state.status === "error" && <ErrorMessage message="無法載入知識庫列表。" />}

      {state.status === "loaded" && state.items.length === 0 && (
        <EmptyState message={query.trim() ? `查無符合「${query.trim()}」的知識庫。` : "尚無知識庫。"} />
      )}

      {state.status === "loaded" && state.items.length > 0 && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {state.items.map((item) => (
            <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
              <Link href={`/knowledge/${item.id}`}>
                <strong>{item.name}</strong>
              </Link>
              <br />
              <span>{item.description}</span>
              <br />
              <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("zh-TW")}</time>
              <br />
              <Link href={`/knowledge/${item.id}/edit`}>編輯</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
