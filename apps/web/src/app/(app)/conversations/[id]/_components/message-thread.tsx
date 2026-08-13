"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { listMessages, sendMessage, type Message } from "@/lib/messages";
import { trackEvent } from "@/lib/telemetry";
import { MessageComposer } from "./message-composer";

const logger = createLogger("web:message-thread");

/**
 * E03-S009: send-message optimistic state. Owns the message list +
 * renders MessageComposer at the bottom, since submitting from the
 * composer needs to immediately affect what's displayed here — the
 * defining behavior the story's title names ("optimistic"): a sent
 * message appears at once as "pending" rather than waiting on the mock
 * round-trip, then reconciles to "sent" or "failed" once it resolves.
 * This is a deliberate contrast with S03-S05's selectors (ModeSwitch/
 * KnowledgeSelector/ModelSelector), which stay non-optimistic (disabled
 * while pending, UI only updates on confirmed success) — those are
 * infrequent settings changes where a brief pending state costs
 * nothing; a chat composer needs to feel instant on every message.
 *
 * A "failed" entry stays visible with a retry action rather than
 * vanishing — the Frontend/UX Boundary's "Optimistic UI 若涉及
 * mutation，失敗時必須 rollback 或明確 reconcile" is satisfied by
 * reconciling (the UI now accurately shows this message did NOT go
 * through) rather than a silent rollback that would leave the user
 * wondering whether their message ever existed.
 *
 * DisplayMessage is a local-only type: "pending"/"failed" never touch
 * lib/messages.ts's persisted store (see that file's own doc comment)
 * — only "sent" entries (backed by a real persisted Message) survive a
 * remount/reload; a pending or failed send that's still in flight when
 * the user navigates away is intentionally not preserved, same
 * accepted-limitation class as every other sessionStorage-backed mock
 * in this codebase.
 */
type DisplayMessage =
  | { kind: "sent"; message: Message }
  | { kind: "pending"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "failed"; localId: string; content: string; attachmentNames: string[] };

type LoadState = "loading" | "error" | "loaded";

export function MessageThread({ conversationId }: { conversationId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading messages", { correlationId, conversationId });

    listMessages(conversationId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        logger.error("failed to load messages", { correlationId, conversationId, code: result.error.code });
        setLoadState("error");
        return;
      }
      setDisplayMessages(result.value.map((message) => ({ kind: "sent", message })));
      setLoadState("loaded");
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  async function attemptSend(localId: string, content: string, attachmentNames: string[]) {
    const correlationId = crypto.randomUUID();
    logger.info("sending message", { correlationId, conversationId, length: content.length, attachmentCount: attachmentNames.length });
    trackEvent("conversation_message_send_attempt", {
      correlationId,
      properties: { conversationId, length: content.length, attachmentCount: attachmentNames.length },
    });

    const result = await sendMessage(conversationId, content, attachmentNames);

    if (!result.ok) {
      logger.error("failed to send message", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_message_send_failure", { correlationId, properties: { code: result.error.code } });
      setDisplayMessages((previous) =>
        previous.map((entry) => (entry.kind !== "sent" && entry.localId === localId ? { ...entry, kind: "failed" } : entry)),
      );
      return;
    }

    logger.info("message sent", { correlationId, conversationId, messageId: result.value.id });
    trackEvent("conversation_message_send_success", { correlationId, properties: { messageId: result.value.id } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind !== "sent" && entry.localId === localId ? { kind: "sent", message: result.value } : entry)),
    );
  }

  function handleComposerSubmit(content: string, attachmentNames: string[]) {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) => [...previous, { kind: "pending", localId, content, attachmentNames }]);
    void attemptSend(localId, content, attachmentNames);
  }

  function handleRetry(localId: string, content: string, attachmentNames: string[]) {
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind !== "sent" && entry.localId === localId ? { kind: "pending", localId, content, attachmentNames } : entry)),
    );
    void attemptSend(localId, content, attachmentNames);
  }

  if (loadState === "loading") {
    return (
      <div style={{ marginTop: 16 }}>
        <LoadingIndicator />
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div style={{ marginTop: 16 }}>
        <ErrorMessage message="無法載入訊息。" />
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      {displayMessages.length === 0 ? (
        <EmptyState message="尚無訊息，開始對話吧。" />
      ) : (
        <ul>
          {displayMessages.map((entry) => {
            const key = entry.kind === "sent" ? entry.message.id : entry.localId;
            const content = entry.kind === "sent" ? entry.message.content : entry.content;
            const attachmentNames = entry.kind === "sent" ? entry.message.attachmentNames : entry.attachmentNames;
            return (
              <li key={key}>
                {content}
                {attachmentNames.length > 0 && <span>（附件：{attachmentNames.join("、")}）</span>}
                {entry.kind === "pending" && <span role="status">傳送中…</span>}
                {entry.kind === "failed" && (
                  <span>
                    <span role="alert">傳送失敗</span>
                    <button type="button" onClick={() => handleRetry(entry.localId, entry.content, entry.attachmentNames)}>
                      重新傳送
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <MessageComposer conversationId={conversationId} onSubmit={handleComposerSubmit} />
    </div>
  );
}
