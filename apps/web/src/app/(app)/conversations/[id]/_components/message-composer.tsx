"use client";

import { useId, useState, type FormEvent } from "react";
import { createLogger } from "@ai-km/logger";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:message-composer");

/**
 * E03-S006: message composer baseline. SOURCE_BASELINE.md's E03 outline
 * gives this story only its title ("E03-S06 Message Composer") — no
 * message/entity field shape, no send semantics, no character limit is
 * defined anywhere in AI_KM_BMAD_High_Granularity/. The epic file's own
 * expanded titles for the stories immediately after this one make the
 * boundary explicit: S07 "Multi-line keyboard behavior" (upgrading this
 * single-line `<input>` to a `<textarea>` with Enter/Shift+Enter
 * handling — same single→multi-stage upgrade pattern as S03→S04's
 * Knowledge Selector), S08 "File attachment picker", and S09
 * "Send-message optimistic state" (actually persisting a message and
 * showing pending/sent/failed — the Message entity itself is E04-S02,
 * Team B, and doesn't exist yet). This story is deliberately scoped to
 * only the composer's own input/validation/reset lifecycle — it does
 * NOT persist anything or append to any message list, since no message
 * list/history feature exists yet. Submitting a valid draft only proves
 * the composer clears itself and is ready for the next message;
 * wiring that up to a real send is S09's explicit job.
 *
 * Fully self-contained (no lib/conversations.ts changes needed) — a
 * signal this is a properly-scoped, genuinely independent atomic slice.
 */
export function MessageComposer({ conversationId }: { conversationId: string }) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const isValid = draft.trim().length > 0;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!isValid) return;

    const correlationId = crypto.randomUUID();
    logger.info("message draft submitted", { correlationId, conversationId, length: draft.trim().length });
    // Length only — never the raw draft text, which may contain
    // arbitrary/sensitive user content (AC7: audit payload must not
    // contain raw sensitive content).
    trackEvent("conversation_message_compose_submit", {
      correlationId,
      properties: { conversationId, length: draft.trim().length },
    });

    setDraft("");
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
      <label htmlFor={inputId}>訊息</label>
      <br />
      <input
        id={inputId}
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="輸入訊息…"
      />
      <button type="submit" disabled={!isValid}>
        送出
      </button>
    </form>
  );
}
