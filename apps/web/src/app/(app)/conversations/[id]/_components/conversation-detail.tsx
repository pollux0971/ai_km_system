"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getConversation, type ConversationMode, type ConversationSummary } from "@/lib/conversations";
import { KnowledgeSelector } from "./knowledge-selector";
import { ModelSelector } from "./model-selector";
import { ModeSwitch } from "./mode-switch";

const logger = createLogger("web:conversation-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; conversation: ConversationSummary };

/**
 * E03-S002/S003/S005: the conversation detail shell — established here
 * since this is the first E03 story (per SOURCE_BASELINE.md's E03
 * outline: S02 Conversation Mode, S03 Knowledge Selector, S04 Multi
 * Knowledge Selection, S05 Model Selector, S06 Message Composer, ...)
 * that needs somewhere to render its own piece of one incrementally-
 * assembled chat interface. Deliberately minimal: title + mode switch +
 * knowledge selector + (Advanced-mode-only) model selector — no message
 * thread/composer yet, that's later stories' job.
 *
 * "not found" (a valid route, id just doesn't resolve to data) is
 * modeled as its own state, distinct from both the generic error state
 * and EmptyState (which is for a valid-but-empty collection, not a
 * missing single resource) — reuses ErrorMessage's existing NOT_FOUND
 * code (E01-S012) rather than inventing new copy.
 *
 * currentMode tracks ModeSwitch's live value (via onModeChange) so
 * ModelSelector can be shown/hidden the moment the user switches modes,
 * without lifting ModeSwitch's other internal state (pending/error) —
 * initialized once the conversation loads, in the same effect that
 * sets `state`, since there's nothing to read `.mode` from before then.
 */
export default function ConversationDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [currentMode, setCurrentMode] = useState<ConversationMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading conversation", { correlationId, id });

    getConversation(id).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load conversation", { correlationId, id, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("conversation not found", { correlationId, id });
        setState({ status: "not-found" });
        return;
      }

      logger.info("conversation loaded", { correlationId, id });
      setState({ status: "loaded", conversation: result.value });
      setCurrentMode(result.value.mode);
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <main style={{ padding: 32 }}>
        <LoadingIndicator />
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage message="無法載入對話。" />
      </main>
    );
  }

  if (state.status === "not-found") {
    return (
      <main style={{ padding: 32 }}>
        <ErrorMessage code="NOT_FOUND" />
      </main>
    );
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>{state.conversation.title}</h1>
      <ModeSwitch
        conversationId={state.conversation.id}
        initialMode={state.conversation.mode}
        onModeChange={setCurrentMode}
      />
      <div style={{ marginTop: 16 }}>
        <KnowledgeSelector conversationId={state.conversation.id} initialScopes={state.conversation.knowledgeScopes} />
      </div>
      {currentMode === "advanced" && (
        <div style={{ marginTop: 16 }}>
          <ModelSelector conversationId={state.conversation.id} initialModel={state.conversation.model} />
        </div>
      )}
    </main>
  );
}
