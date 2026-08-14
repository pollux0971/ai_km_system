"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listKnowledgeBases, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";

const logger = createLogger("web:knowledge-list");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; items: KnowledgeBaseSummary[] };

/**
 * E05-S001: the full knowledge base list. Items aren't linked to a
 * detail view — /knowledge/[id] doesn't exist yet (that's E05-S05 "KB
 * Detail"'s job) — inventing a link to a route that isn't there yet
 * would just be a dead link, same reasoning E03-S001's own
 * conversation-list.tsx originally used for /conversations/[id].
 */
export default function KnowledgeList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    logger.info("loading knowledge base list", { correlationId });

    listKnowledgeBases().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load knowledge base list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("knowledge base list loaded", { correlationId, count: result.value.length });
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
    return <ErrorMessage message="無法載入知識庫列表。" />;
  }

  if (state.items.length === 0) {
    return <EmptyState message="尚無知識庫。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.items.map((item) => (
        <li key={item.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <strong>{item.name}</strong>
          <br />
          <span>{item.description}</span>
          <br />
          <time dateTime={item.updatedAt}>{new Date(item.updatedAt).toLocaleString("zh-TW")}</time>
        </li>
      ))}
    </ul>
  );
}
