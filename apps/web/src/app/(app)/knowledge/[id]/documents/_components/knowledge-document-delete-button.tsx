"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { deleteKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-delete-button");

/**
 * E05-S026 "Delete document confirmation". Closely mirrors
 * DeleteConversation (E03-S025) — clicking 刪除文件 doesn't delete
 * anything by itself, it reveals an explicit role="alertdialog"
 * confirm/cancel step, whose accessible name itself includes the
 * document's own name (`確認刪除文件：${name}`, not just the visible
 * <p> content) — applying DeleteConversation's own independent-review
 * fix directly, rather than starting from the earlier, insufficient
 * "name only in the paragraph" version and rediscovering the same gap.
 * A real deletion, not a soft/archived flag (see
 * deleteKnowledgeBaseDocument's own doc comment) — S025 "Archive
 * document action" already owns the reversible capability.
 *
 * Two structural differences from DeleteConversation, both because this
 * lives inside a list item (knowledge-document-list.tsx) rather than a
 * conversation's own detail page:
 * - No useRouter/navigation on success — there is nowhere to navigate
 *   TO; deleting a document should just make it (and its confirm
 *   dialog) disappear from the list it was already part of. `onDeleted`
 *   is the same "the list changed" callback every other mutating widget
 *   on this page already receives, exactly like
 *   KnowledgeDocumentArchiveToggle's `onToggled`.
 * - No cascade-delete step — deleteKnowledgeBaseDocument's own doc
 *   comment explains why: a KnowledgeBaseDocument has no child entities
 *   the way a conversation has messages, so there is nothing left for
 *   this component to orchestrate after the delete itself succeeds.
 */
export default function KnowledgeDocumentDeleteButton({
  knowledgeBaseId,
  documentId,
  name,
  onDeleted,
}: {
  knowledgeBaseId: string;
  documentId: string;
  name: string;
  onDeleted: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function startConfirming() {
    setError(false);
    setIsConfirming(true);
  }

  function cancelConfirming() {
    setIsConfirming(false);
    setError(false);
  }

  async function handleConfirmDelete() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("deleting document", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_delete_attempt", { correlationId, properties: { knowledgeBaseId, documentId } });

    const result = await deleteKnowledgeBaseDocument(knowledgeBaseId, documentId);

    if (!result.ok) {
      setPending(false);
      logger.error("failed to delete document", { correlationId, knowledgeBaseId, documentId, code: result.error.code });
      trackEvent("knowledge_base_document_delete_failure", {
        correlationId,
        properties: { knowledgeBaseId, documentId, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("document deleted", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_delete_success", { correlationId, properties: { knowledgeBaseId, documentId } });
    onDeleted();
  }

  if (!isConfirming) {
    return (
      <button type="button" onClick={startConfirming}>
        刪除文件
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label={`確認刪除文件：${name}`}>
      <p>確定要刪除「{name}」嗎？此操作無法復原。</p>
      <button type="button" onClick={handleConfirmDelete} disabled={pending}>
        確認刪除
      </button>
      <button type="button" onClick={cancelConfirming} disabled={pending}>
        取消
      </button>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="刪除文件失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
