"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { subscribeToMessagesChanged } from "@/lib/conversation-message-events";
import { listMessages, type MessageCitation } from "@/lib/messages";

const logger = createLogger("web:conversation-related-panel");

/**
 * ux/enterprise-polish: the right rail's「相關內容」panel — the files a
 * conversation has genuinely touched, Claude-Artifacts-style. Two honest
 * data sources only:
 *
 * - 附件: attachmentNames already persisted on this conversation's own
 *   messages (E03-S008). Deduplicated, first-seen order.
 * - 引用來源: `message.citations` (ADR 0016) on assistant replies,
 *   deduplicated by `documentId`.
 *
 * 11-app-shell/phase-3, #42 (顧問裁決): this used to parse `[N]` markers
 * back out of `content` (`extractCitationIds`) and resolve each id
 * through the old by-id mock (`getCitationSource`) to decide what's
 * FORBIDDEN/NOT_FOUND and worth showing — a client-side Deny-Wins check
 * that made sense back when the client itself invented citation ids with
 * no server behind them. That's the same shape of problem ADR 0018 (D2)
 * already named for `state`: recovering a result from a side effect of
 * producing it (the `[N]` markers a reply happens to embed), instead of
 * reading the result the contract already hands over directly
 * (`message.citations`). Now that citations are server-generated and
 * server-authorized (Deny-Wins already happened before the reply ever
 * reached this client — `06-retrieval`'s job, not this shell's), the
 * `[N]` markers keep their OWN, separate purpose unchanged: the inline
 * clickable badge in message-content.tsx / citation-preview-drawer.tsx
 * (a per-citation preview opened by clicking a specific marker inside
 * the bubble) still parses them and still resolves through the old
 * mock — this panel just stops using that same parse for an unrelated
 * job (a whole-conversation summary list) it was never the right source
 * for. There is no file/page metadata to resolve a `documentId` against
 * yet (no contract endpoint for it — an open question, not invented
 * here), so each row shows the citation's own `documentId` verbatim
 * rather than fabricating a filename.
 *
 * Snapshot + same-tab-notify semantics: fetched on mount, conversation
 * change, AND whenever `notifyMessagesChanged(conversationId)` fires
 * (this tab sent a message — see message-thread.tsx's attemptSend) —
 * not live-streamed while a reply is mid-flight, since there's no such
 * thing anymore (the server produces the whole reply before this tab
 * ever sees it). The inline citation badges/attachment rows in the
 * thread remain the always-current per-message source; this rail is a
 * summary that used to only refresh on conversationId change (#40) and
 * now also refreshes on this tab's own sends.
 */
export function ConversationRelatedPanel({ conversationId }: { conversationId: string }) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [citations, setCitations] = useState<MessageCitation[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const correlationId = crypto.randomUUID();
      const result = await listMessages(conversationId);
      if (cancelled) return;

      if (!result.ok) {
        logger.warn("related panel failed to load messages", { correlationId, conversationId, code: result.error.code });
        setFailed(true);
        return;
      }

      const attachmentNames: string[] = [];
      const seenDocumentIds = new Set<string>();
      const dedupedCitations: MessageCitation[] = [];
      for (const message of result.value) {
        for (const name of message.attachmentNames) {
          if (!attachmentNames.includes(name)) attachmentNames.push(name);
        }
        if (message.role === "assistant") {
          for (const citation of message.citations ?? []) {
            if (seenDocumentIds.has(citation.documentId)) continue;
            seenDocumentIds.add(citation.documentId);
            dedupedCitations.push(citation);
          }
        }
      }

      setAttachments(attachmentNames);
      setCitations(dedupedCitations);
      setFailed(false);
    }

    void load();
    const unsubscribe = subscribeToMessagesChanged(conversationId, () => void load());

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [conversationId]);

  return (
    <section className="rail-section" aria-label="相關內容">
      <h2 className="rail-section-title">相關內容</h2>
      {failed ? (
        <p className="rail-empty">無法載入相關內容。</p>
      ) : (
        <>
          <h3 className="rail-subtitle">附件</h3>
          {attachments.length === 0 ? (
            <p className="rail-empty">尚無附件。</p>
          ) : (
            <ul className="rail-list">
              {attachments.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
          <h3 className="rail-subtitle">引用來源</h3>
          {citations.length === 0 ? (
            <p className="rail-empty">尚無引用來源。</p>
          ) : (
            <ul className="rail-list">
              {citations.map((citation) => (
                <li key={citation.documentId}>{citation.documentId}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
