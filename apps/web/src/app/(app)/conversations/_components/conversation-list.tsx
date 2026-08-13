"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listConversations, type ConversationSummary } from "@/lib/conversations";

const logger = createLogger("web:conversation-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: ConversationSummary[] };

/**
 * E03-S001: the full conversation list — distinct from the Home
 * Dashboard's Recent Conversations widget (E01-S008, top 3 only). Items
 * aren't linked to a detail view — /conversations/[id] doesn't exist yet
 * (that's a later E03 story's job, once the chat interface itself is
 * built); inventing a link to a route that isn't there yet would just
 * be a dead link.
 */
export default function ConversationList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    logger.info("loading conversation list", { correlationId });

    listConversations().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load conversation list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("conversation list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", items: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入對話列表。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無對話，開始你的第一個對話。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
        <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <strong>{item.title}</strong>
          <br />
          <span>{item.lastMessagePreview}</span>
          <br />
          <time dateTime={item.lastMessageAt}>{new Date(item.lastMessageAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
