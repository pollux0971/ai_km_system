"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { archiveConversation, unarchiveConversation } from "@/lib/conversations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:archive-conversation");

/**
 * E03-S026 "Archive/unarchive conversation". A single button whose
 * label directly names the action clicking it takes ("封存對話" when
 * active, "取消封存" when archived) — not a fixed label with a separate
 * `aria-pressed` state, since the text itself already, unambiguously
 * describes what happens next; adding `aria-pressed` on top would
 * describe the CURRENT state using a mechanism meant for toggle buttons
 * whose label stays fixed (like ModeSwitch's), which isn't this
 * button's shape.
 *
 * No confirmation step, unlike DeleteConversation — archiving is
 * reversible (that's the entire point of "archive/unarchive" being one
 * capability: either direction always undoes the other), matching the
 * same "low-risk, reversible operations don't need a confirm dialog"
 * reasoning RenameConversation already established.
 *
 * Non-optimistic, matching every other mutation control on this page
 * (ModeSwitch/ModelSelector/KnowledgeSelector/RenameConversation) — this
 * mock resolves near-instantly, nothing real to hide behind an
 * optimistic update.
 */
export function ArchiveConversation({ conversationId, initialArchived }: { conversationId: string; initialArchived: boolean }) {
  const [archived, setArchived] = useState(initialArchived);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    const wasArchived = archived;
    setPending(true);
    setError(false);
    logger.info(wasArchived ? "unarchiving conversation" : "archiving conversation", { correlationId, conversationId });
    trackEvent(wasArchived ? "conversation_unarchive_attempt" : "conversation_archive_attempt", { correlationId, properties: { conversationId } });

    const result = wasArchived ? await unarchiveConversation(conversationId) : await archiveConversation(conversationId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle conversation archived state", { correlationId, conversationId, code: result.error.code });
      trackEvent(wasArchived ? "conversation_unarchive_failure" : "conversation_archive_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("conversation archived state toggled", { correlationId, conversationId, archived: result.value.archived ?? false });
    trackEvent(wasArchived ? "conversation_unarchive_success" : "conversation_archive_success", { correlationId, properties: { conversationId } });
    setArchived(result.value.archived ?? false);
  }

  return (
    <div>
      <button type="button" onClick={handleToggle} disabled={pending}>
        {archived ? "取消封存" : "封存對話"}
      </button>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message={archived ? "取消封存失敗，請稍後再試。" : "封存失敗，請稍後再試。"} />
        </div>
      )}
    </div>
  );
}
