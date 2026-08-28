"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { useConversationEvents } from "@/lib/conversation-events-context";
import { getRecentConversations, type ConversationSummary } from "@/lib/conversations";
import { formatRelativeTime } from "@/lib/format-time";

const logger = createLogger("web:recent-conversations");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: ConversationSummary[] };

/**
 * E01-S008: Home Dashboard's Recent Conversations widget. Reads from
 * apps/web/src/lib/conversations.ts's placeholder data source (see that
 * file's doc comment — not the real E04 contract).
 */
export default function RecentConversations() {
  const [state, setState] = useState<State>({ status: "loading" });

  const refetch = useCallback(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    logger.info("loading recent conversations", { correlationId });

    getRecentConversations().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load recent conversations", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("recent conversations loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", items: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => refetch(), [refetch]);

  /** E03-S039 AC2/AC5 — same trigger set as sidebar.tsx's history rail; see its doc comment. */
  useConversationEvents(
    (event) => {
      if (event.type === "resync" || event.type.startsWith("conversation.")) {
        refetch();
      }
    },
    [refetch],
  );

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入最近對話。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無最近對話。" />;
  }

  return (
    <>
      <ul className="home-list-tile-group">
        {state.items.map((item) => (
          <li key={item.id} className="home-list-tile">
            <strong className="home-list-tile-title">{item.title}</strong>
            <span className="home-list-tile-preview">{item.lastMessagePreview}</span>
            <time className="home-list-tile-time" dateTime={item.lastMessageAt}>
              {formatRelativeTime(item.lastMessageAt)}
            </time>
          </li>
        ))}
      </ul>
      <Link href="/conversations">查看全部對話</Link>
    </>
  );
}
