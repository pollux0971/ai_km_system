"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { getCitationSource, type CitationSource } from "@/lib/citations";
import { extractCitationIds, listMessages } from "@/lib/messages";

const logger = createLogger("web:conversation-related-panel");

/**
 * ux/enterprise-polish: the right rail's「相關內容」panel — the files a
 * conversation has genuinely touched, Claude-Artifacts-style. Two honest
 * data sources only:
 *
 * - 附件: attachmentNames already persisted on this conversation's own
 *   messages (E03-S008). Deduplicated, first-seen order.
 * - 引用來源: the distinct [N] citation ids appearing in assistant
 *   replies (same extractCitationIds parse E13-S005's validation
 *   trusts), resolved through getCitationSource. A source that resolves
 *   to FORBIDDEN/NOT_FOUND is silently omitted — Deny-Wins: an
 *   unauthorized source must not leak into any listing surface, and the
 *   drawer (E03-S015) is where a user who clicks the inline badge gets
 *   the explicit permission-denied explanation.
 *
 * Snapshot semantics: fetched on mount (and conversation change), not
 * live-updated while a reply streams — the rail is a summary surface,
 * and the inline citation badges/attachment rows in the thread remain
 * the always-current source. Same accepted-staleness tradeoff as the
 * sidebar history rail documents.
 */
export function ConversationRelatedPanel({ conversationId }: { conversationId: string }) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [sources, setSources] = useState<CitationSource[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    async function load() {
      const result = await listMessages(conversationId);
      if (cancelled) return;

      if (!result.ok) {
        logger.warn("related panel failed to load messages", { correlationId, conversationId, code: result.error.code });
        setFailed(true);
        return;
      }

      const attachmentNames: string[] = [];
      const citationIds: string[] = [];
      for (const message of result.value) {
        for (const name of message.attachmentNames) {
          if (!attachmentNames.includes(name)) attachmentNames.push(name);
        }
        if (message.role === "assistant") {
          for (const id of extractCitationIds(message.content)) {
            if (!citationIds.includes(id)) citationIds.push(id);
          }
        }
      }

      const resolved = await Promise.all(citationIds.map((id) => getCitationSource(id)));
      if (cancelled) return;

      setAttachments(attachmentNames);
      setSources(resolved.filter((entry): entry is { ok: true; value: CitationSource } => entry.ok).map((entry) => entry.value));
      setFailed(false);
    }

    void load();

    return () => {
      cancelled = true;
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
          {sources.length === 0 ? (
            <p className="rail-empty">尚無引用來源。</p>
          ) : (
            <ul className="rail-list">
              {sources.map((source) => (
                <li key={source.id}>
                  {source.file}（第 {source.page} 頁）
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
