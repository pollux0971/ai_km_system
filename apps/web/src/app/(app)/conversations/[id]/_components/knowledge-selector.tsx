"use client";

import { useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { setConversationKnowledgeScope } from "@/lib/conversations";
import { visibleKnowledgeScopes, type KnowledgeScope } from "@/lib/knowledge-scopes";
import { useCurrentUser } from "@/lib/session-context";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-selector");

const UNSELECTED_VALUE = "";

/**
 * E03-S003: single-select knowledge scope for a conversation (E03-S004
 * upgrades this to multi-select — not this story's job). Only offers
 * scopes visibleKnowledgeScopes() allows for the current user's roles
 * (same UX-only-visibility pattern as E01-S006's nav items) — every
 * scope is "all" today (see lib/knowledge-scopes.ts), but the filter is
 * wired in from day one so a future per-scope restriction needs no UI
 * change here.
 *
 * "尚未選擇" (not selected) is a real, always-available option, not a
 * disabled placeholder — matches ConversationSummary.knowledgeScope's
 * `null` default (see conversations.ts: no auto-select default is
 * defined by spec, so none is presumed).
 *
 * Non-optimistic, same reasoning as ModeSwitch — the mock resolves
 * near-instantly, nothing to hide latency-wise.
 */
export function KnowledgeSelector({
  conversationId,
  initialScope,
}: {
  conversationId: string;
  initialScope: KnowledgeScope | null;
}) {
  const user = useCurrentUser();
  const selectId = useId();
  const [scope, setScope] = useState<KnowledgeScope | null>(initialScope);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const options = visibleKnowledgeScopes(user.roles);

  async function handleChange(nextValue: string) {
    const nextScope = nextValue === UNSELECTED_VALUE ? null : (nextValue as KnowledgeScope);
    if (nextScope === scope || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("switching knowledge scope", { correlationId, conversationId, from: scope, to: nextScope });
    trackEvent("conversation_knowledge_scope_attempt", { correlationId, properties: { from: scope, to: nextScope } });

    const result = await setConversationKnowledgeScope(conversationId, nextScope);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to switch knowledge scope", { correlationId, code: result.error.code });
      trackEvent("conversation_knowledge_scope_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("knowledge scope switched", { correlationId, scope: result.value.knowledgeScope });
    trackEvent("conversation_knowledge_scope_success", {
      correlationId,
      properties: { scope: result.value.knowledgeScope },
    });
    setScope(result.value.knowledgeScope);
  }

  return (
    <div>
      <label htmlFor={selectId}>知識來源</label>
      <br />
      <select
        id={selectId}
        value={scope ?? UNSELECTED_VALUE}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value={UNSELECTED_VALUE}>尚未選擇</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          切換中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="切換知識來源失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
