"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { deleteConversation } from "@/lib/conversations";
import { deleteMessagesForConversation } from "@/lib/messages";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:delete-conversation");

/**
 * E03-S025 "Delete conversation confirmation". SOURCE_BASELINE.md
 * gives this story only its title; the epic file's expanded title adds
 * "confirmation" — the concrete requirement this component exists to
 * satisfy: clicking 刪除對話 doesn't delete anything by itself, it
 * reveals an explicit confirm/cancel step (role="alertdialog", the
 * correct ARIA role for an interruption that requires a response —
 * distinct from RenameConversation's plain inline form, which isn't an
 * "alert" in that sense). No focus trap is implemented here — nothing
 * else in this codebase's UI (including the existing, non-modal
 * CitationPreviewDrawer) manages focus that way, so adding it only for
 * this one component would be inconsistent with the established
 * accessibility baseline, not an improvement on it.
 *
 * A real deletion, not a soft/archived flag — E03-S026 "Archive
 * Conversation" is SOURCE_BASELINE's very next, separate, not-yet-built
 * story, so "archive" and "delete" are deliberately two different
 * capabilities (see lib/conversations.ts's deleteConversation doc
 * comment).
 *
 * Cascades to lib/messages.ts's deleteMessagesForConversation() after
 * deleteConversation() itself succeeds — orchestrated HERE, at the
 * component level, rather than inside deleteConversation(), since
 * conversations.ts has no existing precedent of reaching into
 * messages.ts's own store (see that function's doc comment for the
 * established one-way dependency direction this deliberately doesn't
 * reverse).
 *
 * On success: router.refresh() (invalidate the Router Cache, same
 * established pattern as /conversations/new's create flow) then
 * router.replace("/conversations") — replace, not push, since the
 * conversation this page was showing no longer exists; a user pressing
 * "back" should not land on a dead, now-nonexistent detail route.
 */
export function DeleteConversation({ conversationId, title }: { conversationId: string; title: string }) {
  const router = useRouter();
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
    logger.info("deleting conversation", { correlationId, conversationId });
    trackEvent("conversation_delete_attempt", { correlationId, properties: { conversationId } });

    const result = await deleteConversation(conversationId);

    if (!result.ok) {
      setPending(false);
      logger.error("failed to delete conversation", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_delete_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    await deleteMessagesForConversation(conversationId);

    logger.info("conversation deleted", { correlationId, conversationId });
    trackEvent("conversation_delete_success", { correlationId, properties: { conversationId } });
    router.refresh();
    router.replace("/conversations");
  }

  if (!isConfirming) {
    return (
      <button type="button" onClick={startConfirming}>
        刪除對話
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label="確認刪除對話">
      <p>確定要刪除「{title}」嗎？此操作無法復原。</p>
      <button type="button" onClick={handleConfirmDelete} disabled={pending}>
        確認刪除
      </button>
      <button type="button" onClick={cancelConfirming} disabled={pending}>
        取消
      </button>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="刪除對話失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
