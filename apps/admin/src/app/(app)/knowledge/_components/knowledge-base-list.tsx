"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listKnowledgeBases, type KnowledgeBaseSummary } from "@/lib/knowledge-bases";

const logger = createLogger("admin:knowledge-base-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; knowledgeBases: KnowledgeBaseSummary[] };

/**
 * E11-S011 "Knowledge admin" — same loading/error/empty/loaded shape
 * RoleList (E11-S006) already establishes for a read-only list page.
 * Last-updated time uses the same `<time dateTime>` + `toLocaleString("zh-TW")`
 * pattern UserDetail's own `createdAt` display already establishes.
 */
export default function KnowledgeBaseList() {
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
      setState({ status: "loaded", knowledgeBases: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入知識庫清單。" />;
  }

  if (state.knowledgeBases.length === 0) {
    return <EmptyState message="尚無知識庫。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.knowledgeBases.map((kb) => (
        <li key={kb.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p>
            <strong>{kb.name}</strong>
          </p>
          <p>{kb.description}</p>
          <p>
            最後更新：<time dateTime={kb.updatedAt}>{new Date(kb.updatedAt).toLocaleString("zh-TW")}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
