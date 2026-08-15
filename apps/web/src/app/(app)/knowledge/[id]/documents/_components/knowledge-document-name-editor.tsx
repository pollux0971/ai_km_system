"use client";

import { useId, useState, type FormEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { renameKnowledgeBaseDocument } from "@/lib/knowledge-documents";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-document-name-editor");

/**
 * E05-S023 "Document metadata editor". `name` is the only field on
 * KnowledgeBaseDocument that is genuinely metadata AND meaningfully
 * user-editable — see renameKnowledgeBaseDocument's own doc comment
 * for the full reasoning on why this story's scope is exactly (and
 * only) renaming, not inventing new fields.
 *
 * Closely mirrors RenameConversation (E03-S024) — same view/edit
 * toggle, same draft/pending/error state shape, same "own the display
 * element outright rather than bolting an edit button next to a
 * separately-rendered static name" structure, same disabled-until-
 * non-empty 儲存 button, same self-contained local `name` state
 * updated directly from the mutation's own response (not a parent
 * refetch) once it succeeds. Renders a `<strong>` instead of an `<h1>`
 * when not editing — this sits inside one row of a document LIST, not
 * as a page's own title, so a heading role would be both semantically
 * wrong (multiple `<h1>`s on one page) and misleading to assistive
 * tech (implying page structure that isn't there).
 *
 * Uses the SAME generic "重新命名失敗，請稍後再試。" wording
 * RenameConversation itself uses, not a specific server message the
 * way S014/S016/S021 show — for the same reason RenameConversation's
 * own doc comment gives: the 儲存 button already prevents the common
 * failure case (an empty draft) before any network call, so the only
 * path that reaches the server's own VALIDATION_ERROR here is a
 * bypassed/buggy client; the only OTHER reachable failure is NOT_FOUND
 * (e.g. the document was deleted in another tab), a rare case with
 * nothing document-specific for the user to act on. Contrast with
 * S014's URL format errors or S016's "enable without a path" — both
 * routine, expected ways a user discovers a requirement, where the
 * specific message is what actually helps.
 */
export default function KnowledgeDocumentNameEditor({
  knowledgeBaseId,
  documentId,
  initialName,
}: {
  knowledgeBaseId: string;
  documentId: string;
  initialName: string;
}) {
  const inputId = useId();
  const [name, setName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(initialName);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function startEditing() {
    setDraftName(name);
    setError(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("renaming document", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_rename_attempt", { correlationId, properties: { knowledgeBaseId, documentId } });

    const result = await renameKnowledgeBaseDocument(knowledgeBaseId, documentId, trimmed);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to rename document", { correlationId, knowledgeBaseId, documentId, code: result.error.code });
      trackEvent("knowledge_base_document_rename_failure", {
        correlationId,
        properties: { knowledgeBaseId, documentId, code: result.error.code },
      });
      setError(true);
      return;
    }

    logger.info("document renamed", { correlationId, knowledgeBaseId, documentId });
    trackEvent("knowledge_base_document_rename_success", { correlationId, properties: { knowledgeBaseId, documentId } });
    setName(result.value.name);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <>
        <strong>{name}</strong>{" "}
        <button type="button" onClick={startEditing}>
          重新命名
        </button>
      </>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} style={{ display: "inline" }}>
        <label htmlFor={inputId}>文件名稱</label>
        <br />
        <input id={inputId} type="text" value={draftName} onChange={(event) => setDraftName(event.target.value)} disabled={pending} />
        <button type="submit" disabled={pending || draftName.trim().length === 0}>
          儲存
        </button>
        <button type="button" onClick={cancelEditing} disabled={pending}>
          取消
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 4 }}>
          <ErrorMessage message="重新命名失敗，請稍後再試。" />
        </div>
      )}
    </>
  );
}
