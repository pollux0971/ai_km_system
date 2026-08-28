"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { retryDocumentProcessing } from "@/lib/document-failures";

const logger = createLogger("admin:document-failure-retry-button");

/**
 * E11-S019 "Retry processing". Closely mirrors UserStatusToggle
 * (E11-S005) — `pending`/`error` local state, no confirmation step
 * (retrying is not destructive), `onRetried` is the same "tell the
 * parent to refetch" callback shape.
 *
 * Every real call today resolves to the same NOT_FOUND (see
 * document-failures.ts's own doc comment) — the error path is the one
 * genuinely reachable in production; the success path exists and is
 * tested here at the component level (mocking the lib function, same
 * as every other action component in this app), ready for whenever a
 * real cross-KB channel exists.
 */
export default function DocumentFailureRetryButton({
  documentId,
  onRetried,
}: {
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
    logger.info("retrying document processing", { correlationId, documentId });

    const result = await retryDocumentProcessing(documentId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to retry document processing", { correlationId, documentId, code: result.error.code });
      setError(result.error.message);
      return;
    }

    logger.info("document processing retried", { correlationId, documentId });
    onRetried();
  }

  return (
    <>
      <button type="button" onClick={handleRetry} disabled={pending}>
        重試
      </button>
      {error && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={error} />
        </span>
      )}
    </>
  );
}
