"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { retryDocumentProcessing } from "@/lib/knowledge-documents";
import { simulateParseStep } from "@/lib/parse-progress";
import { simulateIndexStep } from "@/lib/index-progress";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-retry-button");

/**
 * E05-S021 "Retry processing action". Rendered by
 * knowledge-document-list.tsx next to its own "處理失敗" indicator
 * (E05-S020) — one instance per failed document, not a page-level
 * concern, same "small, focused, per-item component" shape this route
 * already has for its three document-adding widgets.
 *
 * Reuses simulateParseStep/simulateIndexStep (E05-S018/S019) for the
 * pending delay rather than introducing a fourth progress primitive —
 * a retry conceptually re-runs parsing and indexing, not uploading
 * (the document, and the "file", already exist; nothing is being
 * re-selected or re-transmitted). Only runs that delay on the SUCCESS
 * path — if retryDocumentProcessing itself rejects (NOT_FOUND /
 * VALIDATION_ERROR, see that function's own doc comment), there is
 * nothing to re-process, so the specific error shows immediately.
 *
 * `onRetried` is the SAME `refetchDocuments` callback
 * KnowledgeDocumentUpload/KnowledgeDocumentUrlImport/
 * KnowledgeDocumentTextInput already receive from their own parent —
 * a retry that changes a document's status is exactly the same kind
 * of "the list changed" event as adding a new one.
 *
 * Telemetry includes `documentId` (a plain identifier, not free-form
 * content) but nothing about the document's name — same "don't log
 * enterprise content" restraint every sibling widget on this page
 * already follows.
 */
export default function KnowledgeDocumentRetryButton({
  knowledgeBaseId,
  documentId,
  onRetried,
}: {
  knowledgeBaseId: string;
  documentId: string;
  onRetried: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(null);
    logger.info("retrying document processing", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_retry_attempt", { correlationId, properties: { knowledgeBaseId, documentId } });

    const result = await retryDocumentProcessing(knowledgeBaseId, documentId);

    if (!result.ok) {
      setPending(false);
      logger.error("failed to retry document processing", { correlationId, knowledgeBaseId, documentId, code: result.error.code });
      trackEvent("knowledge_base_document_retry_failure", {
        correlationId,
        properties: { knowledgeBaseId, documentId, code: result.error.code },
      });
      setError(result.error.message);
      return;
    }

    await simulateParseStep();
    await simulateIndexStep();

    setPending(false);
    logger.info("document processing retried", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_retry_success", { correlationId, properties: { knowledgeBaseId, documentId } });
    onRetried();
  }

  return (
    <>
      <button type="button" onClick={handleRetry} disabled={pending}>
        {pending ? "重試中…" : "重試"}
      </button>
      {error && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={error} />
        </span>
      )}
    </>
  );
}
