"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { setConversationKnowledgeScopes } from "@/lib/conversations";
import { visibleKnowledgeScopes, type KnowledgeScope } from "@/lib/knowledge-scopes";
import { useCurrentUser } from "@/lib/session-context";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:knowledge-selector");

/**
 * E03-S004: multi-select knowledge scope for a conversation, upgrading
 * E03-S003's single-select `<select>` to a checkbox group — the epic's
 * own story titles ("single-select" then "multi-select") frame this as
 * the same capability's next stage, so this replaces S003's UI rather
 * than adding a second selector alongside it. Only offers scopes
 * visibleKnowledgeScopes() allows for the current user's roles (same
 * UX-only-visibility pattern as E01-S006's nav items and S003's own
 * selector). `<fieldset>`/`<legend>` is the native accessible grouping
 * for a set of related checkboxes.
 *
 * Non-optimistic, same reasoning as ModeSwitch/S003's selector — the
 * mock resolves near-instantly, nothing to hide latency-wise. The
 * disabled `<fieldset>` during a pending request also physically
 * prevents a second toggle from firing before the first resolves (no
 * native `onChange` while disabled), so selections can't race.
 */
export function KnowledgeSelector({
  conversationId,
  initialScopes,
}: {
  conversationId: string;
  initialScopes: KnowledgeScope[];
}) {
  const user = useCurrentUser();
  const [scopes, setScopes] = useState<KnowledgeScope[]>(initialScopes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const options = visibleKnowledgeScopes(user.roles);

  async function handleToggle(scope: KnowledgeScope, checked: boolean) {
    const nextScopes = checked ? [...scopes, scope] : scopes.filter((existing) => existing !== scope);

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("switching knowledge scopes", { correlationId, conversationId, from: scopes, to: nextScopes });
    trackEvent("conversation_knowledge_scopes_attempt", {
      correlationId,
      properties: { from: scopes, to: nextScopes },
    });

    const result = await setConversationKnowledgeScopes(conversationId, nextScopes);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to switch knowledge scopes", { correlationId, code: result.error.code });
      trackEvent("conversation_knowledge_scopes_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("knowledge scopes switched", { correlationId, scopes: result.value.knowledgeScopes });
    trackEvent("conversation_knowledge_scopes_success", {
      correlationId,
      properties: { scopes: result.value.knowledgeScopes },
    });
    setScopes(result.value.knowledgeScopes);
  }

  return (
    <div>
      <fieldset disabled={pending}>
        <legend>知識來源</legend>
        {options.map((option) => (
          <div key={option.id}>
            <label>
              <input
                type="checkbox"
                checked={scopes.includes(option.id)}
                onChange={(event) => handleToggle(option.id, event.target.checked)}
              />
              {option.label}
            </label>
          </div>
        ))}
      </fieldset>
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
