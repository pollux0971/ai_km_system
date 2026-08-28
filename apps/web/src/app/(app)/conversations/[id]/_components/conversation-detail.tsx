"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { useConversationEvents } from "@/lib/conversation-events-context";
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
  | { status: "deleted-elsewhere" }
  | { status: "loaded"; conversation: ConversationSummary };

/**
 * E03-S039 AC4: how long the "此對話已在其他視窗刪除" notice stays on
 * screen before navigating away — long enough to actually be read, short
 * enough not to feel stuck. Not user-configurable; there is no AC asking
 * for that.
 */
const DELETED_ELSEWHERE_REDIRECT_DELAY_MS = 2000;

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
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });
  const [currentMode, setCurrentMode] = useState<ConversationMode | null>(null);

  const refetch = useCallback(() => {
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

  useEffect(() => refetch(), [refetch]);

  /**
   * E03-S039 AC4/AC5. `conversation.deleted` for THIS id shows the notice
   * and (below) redirects — never silently refetches into "not-found",
   * which would look identical to "this route was always invalid" and
   * give the user no idea their conversation still exists, just deleted
   * elsewhere. `conversation.updated` for this id, or a `resync` (no id
   * to match against — re-fetch unconditionally, matching every other
   * consumer's resync handling), just re-loads normally. A delete
   * elsewhere always wins over a same-tick update — there is nothing left
   * to "update" once it's gone.
   */
  useConversationEvents(
    (event) => {
      if (event.type === "conversation.deleted" && event.conversationId === id) {
        setState({ status: "deleted-elsewhere" });
        return;
      }
      if (event.type === "resync" || (event.type === "conversation.updated" && event.conversationId === id)) {
        refetch();
      }
    },
    [id, refetch],
  );

  useEffect(() => {
    if (state.status !== "deleted-elsewhere") return undefined;
    const timeout = setTimeout(() => {
      router.replace("/conversations");
    }, DELETED_ELSEWHERE_REDIRECT_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [state.status, router]);

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

  if (state.status === "deleted-elsewhere") {
    // NOT role="status" — every message-thread E2E spec's
    // waitForThreadToSettle() polls `page.getByRole("main").getByRole("status")`
    // to 0 as its "still busy" signal (see message-thread.tsx's own doc
    // comment on the same collision for its permanent negative states).
    // This is a terminal notice before an automatic redirect, not a busy
    // indicator — aria-live alone announces it without claiming that role.
    return (
      <main style={{ padding: 32 }}>
        <p aria-live="polite">此對話已在其他視窗刪除，即將返回對話列表…</p>
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
