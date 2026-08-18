"use client";

import { useEffect, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { getConversation, type ConversationMode, type ConversationSummary } from "@/lib/conversations";
import { ArchiveConversation } from "./archive-conversation";
import { ConversationModeMenu } from "./conversation-mode-menu";
import { ConversationRelatedPanel } from "./conversation-related-panel";
import { DeleteConversation } from "./delete-conversation";
import { KnowledgeSelector } from "./knowledge-selector";
import { MessageThread } from "./message-thread";
import { ModelSelector } from "./model-selector";
import { ModeSwitch } from "./mode-switch";
import { RenameConversation } from "./rename-conversation";

const logger = createLogger("web:conversation-detail");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "loaded"; conversation: ConversationSummary };

/**
 * E03-S002/S003/S005/S006/S009: the conversation detail shell —
 * established here since this is the first E03 story (per
 * SOURCE_BASELINE.md's E03 outline: S02 Conversation Mode, S03
 * Knowledge Selector, S04 Multi Knowledge Selection, S05 Model
 * Selector, S06 Message Composer, ...) that needs somewhere to render
 * its own piece of one incrementally-assembled chat interface: title +
 * mode switch + knowledge selector + (Advanced-mode-only) model
 * selector + message thread (list + composer, S09).
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
 *
 * S24 "Rename Conversation" replaces this component's own static
 * `<h1>{title}</h1>` with <RenameConversation>, which owns the title
 * area (both the display heading AND the edit UI) outright rather than
 * this component keeping the heading and only adding a button next to
 * it — no other sibling here reads the live title the way currentMode
 * is threaded to ModelSelector, so there's nothing to lift up.
 *
 * S25 "Delete Conversation" adds <DeleteConversation> right after
 * RenameConversation — both are controls about the conversation's own
 * identity/existence (its name, and whether it exists at all), grouped
 * together rather than separated by the mode/knowledge/model controls
 * that follow. Unlike every other control here, a successful delete
 * navigates away entirely (back to /conversations) — there is no
 * "still on this page, showing the updated result" outcome, since the
 * page's own subject no longer exists.
 *
 * S26 "Archive/unarchive Conversation" adds <ArchiveConversation> in
 * the same identity/existence group as Rename and Delete. Unlike
 * delete, a successful archive/unarchive stays on this page — the
 * conversation still exists, just with its archived flag flipped, so
 * there's nothing to navigate away from.
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

  /*
   * ux/enterprise-polish (Claude-style three-zone layout):
   * - slim header: title/rename on the left, archive/delete on the right;
   * - center column: the thread + composer, with the mode switch
   *   relocated into a pop-up menu in the composer's action row
   *   (ConversationModeMenu wraps the untouched ModeSwitch);
   * - right rail: knowledge scopes, the Advanced-mode-only model
   *   selector, and the related-content panel (attachments + citation
   *   sources).
   * Every control keeps its own component/behavior — only placement
   * changed.
   */
  return (
    <main className="chat-page">
      <div className="chat-page-header">
        <RenameConversation conversationId={state.conversation.id} initialTitle={state.conversation.title} />
        <div className="chat-page-header-actions">
          <ArchiveConversation conversationId={state.conversation.id} initialArchived={state.conversation.archived ?? false} />
          <DeleteConversation conversationId={state.conversation.id} title={state.conversation.title} />
        </div>
      </div>
      <div className="chat-page-body">
        <div className="chat-page-center">
          <MessageThread
            conversationId={state.conversation.id}
            composerAccessory={
              <ConversationModeMenu mode={currentMode}>
                <ModeSwitch
                  conversationId={state.conversation.id}
                  initialMode={state.conversation.mode}
                  onModeChange={setCurrentMode}
                />
              </ConversationModeMenu>
            }
          />
        </div>
        <aside className="chat-rail" aria-label="對話設定">
          <section className="rail-section" aria-label="知識來源設定">
            <KnowledgeSelector conversationId={state.conversation.id} initialScopes={state.conversation.knowledgeScopes} />
          </section>
          {currentMode === "advanced" && (
            <section className="rail-section" aria-label="AI 模型設定">
              <ModelSelector conversationId={state.conversation.id} initialModel={state.conversation.model} />
            </section>
          )}
          <ConversationRelatedPanel conversationId={state.conversation.id} />
        </aside>
      </div>
    </main>
  );
}
