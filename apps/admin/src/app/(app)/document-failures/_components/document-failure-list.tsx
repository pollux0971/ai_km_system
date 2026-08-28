"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listFailedDocuments, type FailedDocument } from "@/lib/document-failures";
import DocumentFailureRetryButton from "./document-failure-retry-button";

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
 *
 * E11-S019 "Retry processing" adds a `DocumentFailureRetryButton` per
 * row. `fetchDocuments` is pulled out of the mount effect (still
 * guarded against an unmounted-component state update) so the SAME
 * fetch can be re-triggered as `onRetried` — the same "the parent
 * re-fetches, the child doesn't keep its own state" shape UserList's
 * own `fetchUsers`/`onToggled` (E11-S005) already establishes.
 */
export default function DocumentFailureList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const fetchDocuments = useCallback((cancelledRef?: { current: boolean }) => {
    const correlationId = crypto.randomUUID();
    logger.info("loading document failure list", { correlationId });

    listFailedDocuments().then((result) => {
      if (cancelledRef?.current) return;

      if (!result.ok) {
        logger.error("failed to load document failure list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("document failure list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", documents: result.value });
    });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchDocuments(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchDocuments]);

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
        <li key={document.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p>
            <strong>{document.name}</strong>
          </p>
          <p>{document.knowledgeBaseId}</p>
          <p>
            <time dateTime={document.uploadedAt}>{new Date(document.uploadedAt).toLocaleString("zh-TW")}</time>
          </p>
          <p>
            <DocumentFailureRetryButton documentId={document.id} onRetried={() => fetchDocuments()} />
          </p>
        </li>
      ))}
    </ul>
  );
}
