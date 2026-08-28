"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { archiveKnowledgeBaseDocument, deleteKnowledgeBaseDocument, unarchiveKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-bulk-actions");

/**
 * E05-S030 "Bulk document selection/actions". No new lib function for
 * either action — same "loop over the existing single-item function,
 * sequentially, from the component layer" precedent
 * KnowledgeDocumentUpload's multi-file batch (E05-S012) already
 * established for the identical shape of problem in this exact
 * codebase (that story explicitly analyzed and rejected relying on
 * parallel calls racing through microtask scheduling, choosing a plain
 * `for...of` + `await` loop instead) — reused here rather than
 * re-deriving it, and rather than inventing a new
 * `bulkArchiveKnowledgeBaseDocuments(ids)`-shaped export that doesn't
 * exist anywhere else in this file's own precedent.
 *
 * Each selected document is its own independent unit exactly like each
 * uploaded file was in S012: one failing (e.g. a NOT_FOUND if it was
 * removed by a concurrent action) doesn't stop the rest, and the
 * failure count is reported distinctly afterward — same
 * `${failedCount} 個XX失敗，請稍後再試。` shape
 * knowledge-document-upload.tsx's own `failedCount`/`ErrorMessage`
 * already established, just for documents instead of files.
 *
 * `onCompleted` fires only when AT LEAST ONE selected document
 * genuinely succeeded — same `if (anySucceeded) onUploaded()` shape
 * S012 already established, not a blind "always fires" callback. If
 * every single one failed, nothing about the list actually changed, so
 * there is nothing for the parent to refetch or clear the selection
 * over; the failure message stays visible either way so the user can
 * see what happened and retry via each document's own existing
 * per-item archive/delete control.
 *
 * Bulk archive/unarchive is directional based on `viewingArchived` —
 * same context-sensitive framing KnowledgeDocumentArchiveToggle already
 * uses per document, just applied to the whole selected batch at once;
 * bulk delete reuses the exact same role="alertdialog" confirm/cancel
 * shape as KnowledgeDocumentDeleteButton (E05-S026), with a count-based
 * message instead of a single document's name since there is no one
 * name to name here. Unlike the single-item version, the confirm
 * dialog closes once the attempt finishes regardless of partial
 * failure (there is no single "stay and let me try again" affordance
 * that makes sense for a batch the way it does for one document) — the
 * failure count renders as its own standalone message outside the
 * dialog instead, so it stays visible after the dialog itself closes.
 *
 * `onPendingChange` mirrors this component's own `pending` state up to
 * the parent, which uses it to disable every selection checkbox
 * (per-document and 全選) for the duration. Without this, nothing stops
 * a user from unchecking every box mid-operation — this toolbar only
 * renders while `selectedIds.size > 0`, so an empty selection unmounts
 * it while its own archive/unarchive/delete loop is still awaiting a
 * later item, and a fresh selection could then start a SECOND,
 * genuinely overlapping bulk operation before the first one's loop
 * finishes. Disabling selection input for the duration closes this at
 * its root — the same "disabled while pending physically prevents a
 * second one from racing the first" reasoning
 * KnowledgePermissionEditor's own fieldset already uses, just lifted
 * one level because the thing that needs disabling (the checkboxes)
 * lives in the parent, not in this component itself.
 */
export default function KnowledgeDocumentBulkActions({
  knowledgeBaseId,
  documentIds,
  viewingArchived,
  onCompleted,
  onPendingChange,
}: {
  knowledgeBaseId: string;
  documentIds: string[];
  viewingArchived: boolean;
  onCompleted: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [archiveFailedCount, setArchiveFailedCount] = useState(0);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteFailedCount, setDeleteFailedCount] = useState(0);

  async function handleBulkArchiveToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    onPendingChange(true);
    setArchiveFailedCount(0);
    logger.info(viewingArchived ? "bulk unarchiving documents" : "bulk archiving documents", {
      correlationId,
      knowledgeBaseId,
      documentIds,
    });
    trackEvent(viewingArchived ? "knowledge_base_document_bulk_unarchive_attempt" : "knowledge_base_document_bulk_archive_attempt", {
      correlationId,
      properties: { knowledgeBaseId, count: documentIds.length },
    });

    let failedCount = 0;
    for (const documentId of documentIds) {
      const result = viewingArchived
        ? await unarchiveKnowledgeBaseDocument(knowledgeBaseId, documentId)
        : await archiveKnowledgeBaseDocument(knowledgeBaseId, documentId);
      if (!result.ok) failedCount += 1;
    }

    setPending(false);
    onPendingChange(false);
    setArchiveFailedCount(failedCount);
    const anySucceeded = failedCount < documentIds.length;

    if (failedCount > 0) {
      logger.error("some documents failed to bulk archive/unarchive", { correlationId, knowledgeBaseId, failedCount });
      trackEvent(viewingArchived ? "knowledge_base_document_bulk_unarchive_failure" : "knowledge_base_document_bulk_archive_failure", {
        correlationId,
        properties: { knowledgeBaseId, failedCount },
      });
    }
    if (anySucceeded) {
      logger.info("bulk archive/unarchive completed", { correlationId, knowledgeBaseId, succeededCount: documentIds.length - failedCount });
      trackEvent(viewingArchived ? "knowledge_base_document_bulk_unarchive_success" : "knowledge_base_document_bulk_archive_success", {
        correlationId,
        properties: { knowledgeBaseId, succeededCount: documentIds.length - failedCount },
      });
      onCompleted();
    }
  }

  function startConfirmingDelete() {
    setDeleteFailedCount(0);
    setIsConfirmingDelete(true);
  }

  function cancelConfirmingDelete() {
    setIsConfirmingDelete(false);
    setDeleteFailedCount(0);
  }

  async function handleConfirmBulkDelete() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    onPendingChange(true);
    setDeleteFailedCount(0);
    logger.info("bulk deleting documents", { correlationId, knowledgeBaseId, documentIds });
    trackEvent("knowledge_base_document_bulk_delete_attempt", { correlationId, properties: { knowledgeBaseId, count: documentIds.length } });

    let failedCount = 0;
    for (const documentId of documentIds) {
      const result = await deleteKnowledgeBaseDocument(knowledgeBaseId, documentId);
      if (!result.ok) failedCount += 1;
    }

    setPending(false);
    onPendingChange(false);
    setIsConfirmingDelete(false);
    setDeleteFailedCount(failedCount);
    const anySucceeded = failedCount < documentIds.length;

    if (failedCount > 0) {
      logger.error("some documents failed to bulk delete", { correlationId, knowledgeBaseId, failedCount });
      trackEvent("knowledge_base_document_bulk_delete_failure", { correlationId, properties: { knowledgeBaseId, failedCount } });
    }
    if (anySucceeded) {
      logger.info("bulk delete completed", { correlationId, knowledgeBaseId, succeededCount: documentIds.length - failedCount });
      trackEvent("knowledge_base_document_bulk_delete_success", { correlationId, properties: { knowledgeBaseId, succeededCount: documentIds.length - failedCount } });
      onCompleted();
    }
  }

  return (
    <div role="group" aria-label="批次操作" style={{ marginBottom: 16, padding: 8, border: "1px solid var(--border)" }}>
      <span>已選擇 {documentIds.length} 份文件</span>
      <button type="button" onClick={handleBulkArchiveToggle} disabled={pending}>
        {viewingArchived ? "取消封存所選文件" : "封存所選文件"}
      </button>
      {!isConfirmingDelete && (
        <button type="button" onClick={startConfirmingDelete} disabled={pending}>
          刪除所選文件
        </button>
      )}
      {archiveFailedCount > 0 && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={`${archiveFailedCount} 份文件${viewingArchived ? "取消封存" : "封存"}失敗，請稍後再試。`} />
        </span>
      )}
      {deleteFailedCount > 0 && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={`${deleteFailedCount} 份文件刪除失敗，請稍後再試。`} />
        </span>
      )}
      {isConfirmingDelete && (
        <div role="alertdialog" className="m3-dialog" aria-label={`確認刪除 ${documentIds.length} 份文件`}>
          <p>確定要刪除這 {documentIds.length} 份文件嗎？此操作無法復原。</p>
          <button type="button" onClick={handleConfirmBulkDelete} disabled={pending}>
            確認刪除
          </button>
          <button type="button" onClick={cancelConfirmingDelete} disabled={pending}>
            取消
          </button>
        </div>
      )}
    </div>
  );
}
