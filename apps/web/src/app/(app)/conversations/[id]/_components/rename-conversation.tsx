"use client";

import { useId, useState, type FormEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { renameConversation } from "@/lib/conversations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:rename-conversation");

/**
 * E03-S024 "Rename conversation". SOURCE_BASELINE.md gives this story
 * only its title — no body content anywhere. Owns the detail page's
 * <h1> outright (conversation-detail.tsx delegates the whole title
 * area here, not just an edit button bolted next to a static heading
 * it still renders itself) so view and edit are the same element,
 * never two divergent titles briefly visible at once.
 *
 * Deliberately NOT optimistic — same precedent as ModeSwitch/
 * ModelSelector/KnowledgeSelector (this mock resolves near-instantly,
 * nothing real to hide behind an optimistic update): `title` only
 * updates once the rename is confirmed.
 *
 * The 儲存 button is disabled for an empty/whitespace-only draft —
 * same "defense in depth, not the only guard" reasoning as
 * ModelSelector rejecting a disabled model server-side too:
 * renameConversation() ALSO validates and fails closed with
 * VALIDATION_ERROR, so a buggy/bypassed client still can't persist a
 * blank title. Because the button already prevents the common empty
 * case before any network call, the server-error path shown below is
 * the rarer one (e.g. NOT_FOUND), so it uses the same generic
 * "failed, try again" wording ModeSwitch/ModelSelector already use for
 * their own error states — not the specific server message, matching
 * this codebase's consistent choice not to surface raw API error text
 * to the user.
 *
 * Scoped to the detail page only, not also inline in the conversation
 * list (E03-S001/S022/S023) — SOURCE_BASELINE names nothing about
 * renaming from the list, and adding it there would mean rename UI
 * interacting with pagination/search state for no requested reason.
 */
export function RenameConversation({ conversationId, initialTitle }: { conversationId: string; initialTitle: string }) {
  const inputId = useId();
  const [title, setTitle] = useState(initialTitle);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(initialTitle);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function startEditing() {
    setDraftTitle(title);
    setError(false);
    setIsEditing(true);
  }

  function cancelEditing() {
    setIsEditing(false);
    setError(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("renaming conversation", { correlationId, conversationId });
    trackEvent("conversation_rename_attempt", { correlationId, properties: { conversationId } });

    const result = await renameConversation(conversationId, trimmed);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to rename conversation", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_rename_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("conversation renamed", { correlationId, conversationId });
    trackEvent("conversation_rename_success", { correlationId, properties: { conversationId } });
    setTitle(result.value.title);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div>
        <h1>{title}</h1>
        <button type="button" onClick={startEditing}>
          重新命名
        </button>
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <label htmlFor={inputId}>對話名稱</label>
        <br />
        <input id={inputId} type="text" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} disabled={pending} />
        <button type="submit" disabled={pending || draftTitle.trim().length === 0}>
          儲存
        </button>
        <button type="button" onClick={cancelEditing} disabled={pending}>
          取消
        </button>
      </form>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="重新命名失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
