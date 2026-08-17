"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listFailedDocuments, type FailedDocument } from "@/lib/document-failures";

const logger = createLogger("admin:document-failure-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; documents: FailedDocument[] };

/**
 * E11-S018 "Document failure queue" — same loading/error/empty/loaded
 * shape `AuditEventList` (E11-S015) already establishes for a sibling
 * "always empty today" read-only viewer. Unlike Audit though, `empty`
 * isn't just "no real data source exists" — `document-failures.ts`'s
 * own doc comment explains it's also honestly the current answer even
 * if a real aggregation channel existed, since apps/web's own seed
 * data has zero failed documents today.
 */
export default function DocumentFailureList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading document failure list", { correlationId });

    listFailedDocuments().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load document failure list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("document failure list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", documents: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入文件失敗清單。" />;
  }

  if (state.documents.length === 0) {
    return <EmptyState message="尚無處理失敗的文件。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.documents.map((document) => (
        <li key={document.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <p>
            <strong>{document.name}</strong>
          </p>
          <p>{document.knowledgeBaseId}</p>
          <p>
            <time dateTime={document.uploadedAt}>{new Date(document.uploadedAt).toLocaleString("zh-TW")}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
