"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { archiveKnowledgeBaseDocument, unarchiveKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-archive-toggle");

/**
 * E05-S025 "Archive document action". Closely mirrors
 * ArchiveConversation (E03-S026) — button label directly names the
 * next action ("封存文件"/"取消封存"), no confirmation step (archiving
 * is reversible, same "low-risk, reversible operations don't need a
 * confirm dialog" reasoning RenameConversation/KnowledgeDocumentNameEditor
 * already established), non-optimistic.
 *
 * Deliberately does NOT keep its own local `archived` state the way
 * ArchiveConversation does — that component lives on a conversation's
 * own detail page, which stays mounted regardless of archived state,
 * so it needs to flip its own label in place. This component lives
 * inside knowledge-document-list.tsx's active/archived VIEW SWITCH
 * (mirroring ConversationList's own "作用中"/"已封存" split): once a
 * toggle succeeds, the parent refetches the CURRENT view, and the
 * just-toggled document no longer matches that filter — this
 * component's own `<li>` disappears from the list entirely, so there
 * is nothing for it to keep flipped-in-place. `onToggled` is the
 * parent's own refetch, the same "the list changed" callback every
 * other mutating widget on this page already receives.
 */
export default function KnowledgeDocumentArchiveToggle({
  knowledgeBaseId,
  documentId,
  archived,
  onToggled,
}: {
  knowledgeBaseId: string;
  documentId: string;
  archived: boolean;
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info(archived ? "unarchiving document" : "archiving document", { correlationId, knowledgeBaseId, documentId });
    trackEvent(archived ? "knowledge_base_document_unarchive_attempt" : "knowledge_base_document_archive_attempt", {
      correlationId,
      properties: { knowledgeBaseId, documentId },
    });

    const result = archived
      ? await unarchiveKnowledgeBaseDocument(knowledgeBaseId, documentId)
      : await archiveKnowledgeBaseDocument(knowledgeBaseId, documentId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle document archived state", { correlationId, knowledgeBaseId, documentId, code: result.error.code });
      trackEvent(archived ? "knowledge_base_document_unarchive_failure" : "knowledge_base_document_archive_failure", {
        correlationId,
        properties: { knowledgeBaseId, documentId, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("document archived state toggled", { correlationId, knowledgeBaseId, documentId, archived: result.value.archived ?? false });
    trackEvent(archived ? "knowledge_base_document_unarchive_success" : "knowledge_base_document_archive_success", {
      correlationId,
      properties: { knowledgeBaseId, documentId },
    });
    onToggled();
  }

  return (
    <>
      <button type="button" onClick={handleToggle} disabled={pending}>
        {archived ? "取消封存" : "封存文件"}
      </button>
      {error && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={archived ? "取消封存失敗，請稍後再試。" : "封存失敗，請稍後再試。"} />
        </span>
      )}
    </>
  );
}
