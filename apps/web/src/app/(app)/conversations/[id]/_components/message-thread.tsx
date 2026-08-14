"use client";

import { useEffect, useRef, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { GENERATION_PHASE_LABELS, runGenerationPhases, type GenerationPhase } from "@/lib/generation-status";
import { deleteMessage, listMessages, receiveAssistantReply, sendMessage, type Message } from "@/lib/messages";
import { streamAssistantReply } from "@/lib/streaming";
import { trackEvent } from "@/lib/telemetry";
import { CitationPreviewDrawer } from "./citation-preview-drawer";
import { ConversationContextIndicator } from "./conversation-context-indicator";
import { MessageComposer } from "./message-composer";
import { MessageContent } from "./message-content";

const logger = createLogger("web:message-thread");

/**
 * E03-S009/S010: message thread. Owns the message list + renders
 * MessageComposer at the bottom, since submitting from the composer
 * needs to immediately affect what's displayed here — the defining
 * behavior S09's title names ("optimistic"): a sent message appears at
 * once as "pending" rather than waiting on the mock round-trip, then
 * reconciles to "sent" or "failed" once it resolves. This is a
 * deliberate contrast with S03-S05's selectors (ModeSwitch/
 * KnowledgeSelector/ModelSelector), which stay non-optimistic (disabled
 * while pending, UI only updates on confirmed success) — those are
 * infrequent settings changes where a brief pending state costs
 * nothing; a chat composer needs to feel instant on every message.
 *
 * A "failed"/"stream-failed" entry stays visible with a retry action
 * rather than vanishing — the Frontend/UX Boundary's "Optimistic UI 若
 * 涉及 mutation，失敗時必須 rollback 或明確 reconcile" is satisfied by
 * reconciling (the UI now accurately shows this message did NOT go
 * through) rather than a silent rollback that would leave the user
 * wondering whether their message ever existed.
 *
 * DisplayMessage is a local-only type: only "sent" entries have a real
 * persisted Message; every other kind is transient UI state that
 * doesn't survive a remount/reload — same accepted-limitation class as
 * every other sessionStorage-backed mock in this codebase.
 *
 * S10 adds the streaming pair (`streaming`/`stream-failed`), triggered
 * automatically once a user's own message finishes sending — see
 * startStream(). S13 renders citation badges within assistant content
 * via MessageContent (see message-content.tsx for why this is a plain
 * regex-parsed marker, not structured data). S14 adds the interaction:
 * clicking a badge sets `previewCitationId`, which drives a single
 * shared `CitationPreviewDrawer` rendered once at the bottom of this
 * component (not one drawer per message — there's only ever one
 * citation being previewed at a time for the whole thread). S21 "Answer
 * State" (ANSWERED/PARTIAL/NO_EVIDENCE/PERMISSION_DENIED/SOURCE_UNAVAILABLE/
 * ERROR) is a semantic
 * answer-quality classification that needs real RAG/permission
 * infrastructure to be meaningful — this story's own sent/streaming/
 * stream-failed states are a much simpler mechanical transport-layer
 * status, deliberately not reusing or partially implementing that enum.
 *
 * S11 "Generation Status" adds `phase` to the `streaming` entry — the
 * three lib/generation-status.ts phases (searching/reading/generating)
 * shown briefly before any reply text exists. Once real content starts
 * arriving from lib/streaming.ts, `phase` is cleared back to `null` —
 * the growing text itself is then the live indicator that generation
 * is still happening, so there's no dedicated post-"generating" phase.
 *
 * S12 "Stop Generation" adds a cancel control, live while `kind ===
 * "streaming"`. `stoppedRef` (a plain mutable Set, not state — stopping
 * doesn't itself need to trigger a render; the loops below notice it on
 * their own next iteration) tracks which in-flight localIds the user
 * asked to stop. runStream() checks it after every phase/chunk and
 * breaks out early. What happens next depends on whether any real text
 * had arrived yet: with content, the partial text is persisted through
 * the exact same receiveAssistantReply → reconcile-to-"sent" path a
 * natural completion uses (real chat products keep whatever was
 * generated so far rather than discarding it — stopping is "I have
 * enough," not "throw this away"); with no content yet (stopped during
 * the phase sequence, before any chunk arrived), there is nothing
 * meaningful to keep, so the entry is removed outright rather than
 * persisting an empty-content message.
 *
 * S17 "Multi-turn Conversation" makes turns strictly sequential:
 * `isTurnInFlight` (derived, not separate state — `pending`/`streaming`
 * entries are already tracked in `displayMessages`) disables
 * MessageComposer's submit while a previous turn hasn't settled yet,
 * matching the same "real chat products" precedent already used for
 * S12 (ChatGPT/Claude block sending a new message until the current
 * reply finishes or is stopped, rather than allowing overlapping
 * turns). Deliberately NOT extended to `failed`/`stream-failed` — those
 * are settled-but-unsuccessful states a user can retry OR simply move
 * past by sending something new, not an in-flight turn blocking
 * anything; nothing before S17 ever prevented that, and this story
 * doesn't add a new restriction there. Every message and its assistant
 * reply were already architecturally independent (own localId, own
 * stoppedRef entry, functional setDisplayMessages updates) before this
 * story — S17's own job is proving that holds across a REAL multi-turn
 * sequence (not just reasoning about it) and closing the one real gap
 * that let turns overlap in the first place.
 *
 * S18 adds `sentMessageCount` (also derived — counting only
 * `kind: "sent"` entries) driving `ConversationContextIndicator`,
 * rendered just above MessageComposer since it's informing the user
 * about what's available for the NEXT turn they're about to start.
 * See conversation-context-indicator.tsx for why this is a pure
 * display feature (the epic's own "indicator" wording), not a request
 * to wire real history into lib/streaming.ts's mock call. Suppressed
 * entirely while `displayMessages.length === 0` — EmptyState's "尚無
 * 訊息，開始對話吧。" already says there's nothing yet; showing the
 * indicator's own "上下文：目前尚無先前訊息。" alongside it would be
 * two differently-worded statements of the exact same fact at once.
 * Once at least one entry exists (even just a still-in-flight first
 * message, before anything has settled), the indicator reappears —
 * `sentMessageCount` can still legitimately read 0 at that point, and
 * that's meaningful information no longer competing with EmptyState.
 *
 * S19 "Regenerate Answer" adds a "重新產生" control on the LAST entry
 * only, and only when it's a settled (`kind: "sent"`) assistant reply
 * — distinct wording from S10's existing "重新產生回覆" (which retries
 * a *failed* stream) so the two never read as the same action; this
 * one redoes an already-*successful* reply the user wants a different
 * answer for. Deliberately restricted to the last entry: SOURCE_BASELINE
 * defines nothing about regenerating a message buried earlier in the
 * thread, and real chat products (the same precedent already used for
 * S12/S17) only ever offer this on the most recent reply — doing it
 * mid-thread would require inventing branching/discard semantics for
 * everything after it, which nothing asks for.
 *
 * handleRegenerate() calls deleteMessage() on the old message id
 * BEFORE flipping the display entry back to a fresh `streaming` state
 * and re-running runStream() — without the delete, the old message
 * would linger in the store while receiveAssistantReply() (inside the
 * reused runStream) adds a new one, so a reload would show BOTH the
 * discarded and the regenerated reply instead of replacing it (exactly
 * the "重複請求不得造成未定義重複 side effect" Functional AC 5 warns
 * about). Reusing runStream wholesale — same phases, same streaming,
 * same stop support, same telemetry — rather than a parallel
 * implementation means regeneration automatically inherits S12's stop
 * behavior too: stopping a regeneration before any content arrives
 * removes the entry outright (same as any other empty-stop), leaving
 * that turn with no assistant reply at all — the old one is already
 * gone and nothing replaced it. This is an accepted, deliberate
 * consequence of composing two already-independently-justified
 * features, not a new gap; inventing "restore the discarded reply if
 * regeneration is stopped early" would be unrequested undo semantics
 * this story's grounding never asks for.
 */
type DisplayMessage =
  | { kind: "sent"; message: Message }
  | { kind: "pending"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "failed"; localId: string; content: string; attachmentNames: string[] }
  | { kind: "streaming"; localId: string; content: string; phase: GenerationPhase | null }
  | { kind: "stream-failed"; localId: string };

type LoadState = "loading" | "error" | "loaded";

export function MessageThread({ conversationId }: { conversationId: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [previewCitationId, setPreviewCitationId] = useState<string | null>(null);
  const stoppedRef = useRef<Set<string>>(new Set());

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
        previous.map((entry) => (entry.kind === "pending" && entry.localId === localId ? { ...entry, kind: "failed" } : entry)),
      );
      return;
    }

    logger.info("message sent", { correlationId, conversationId, messageId: result.value.id });
    trackEvent("conversation_message_send_success", { correlationId, properties: { messageId: result.value.id } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "pending" && entry.localId === localId ? { kind: "sent", message: result.value } : entry)),
    );

    startStream();
  }

  function handleComposerSubmit(content: string, attachmentNames: string[]) {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) => [...previous, { kind: "pending", localId, content, attachmentNames }]);
    void attemptSend(localId, content, attachmentNames);
  }

  function handleRetry(localId: string, content: string, attachmentNames: string[]) {
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "failed" && entry.localId === localId ? { kind: "pending", localId, content, attachmentNames } : entry)),
    );
    void attemptSend(localId, content, attachmentNames);
  }

  /**
   * E03-S010. streamAssistantReply() takes no "prompt" argument — the
   * mock always yields the same fixed placeholder text (see
   * lib/streaming.ts), so threading the user's message content through
   * here would be a dead parameter nothing reads yet. A real
   * implementation extending this later is exactly the kind of change
   * that belongs to whichever story actually wires up a real Model
   * Gateway call, not something to speculatively half-build now.
   */
  async function runStream(localId: string) {
    const correlationId = crypto.randomUUID();
    logger.info("streaming assistant reply", { correlationId, conversationId });
    trackEvent("conversation_message_stream_attempt", { correlationId, properties: { conversationId } });

    for await (const phase of runGenerationPhases()) {
      if (stoppedRef.current.has(localId)) break;
      setDisplayMessages((previous) =>
        previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { ...entry, phase } : entry)),
      );
    }
    // `phase` stays at its last value ("generating") here — NOT cleared
    // yet. Clearing it the instant the phase sequence exhausts (rather
    // than once real content actually arrives) would leave "generating"
    // visible for at most one render tick, regardless of how long the
    // gap before the first real chunk turns out to be — effectively
    // never SHOWING it despite that being this story's whole point.

    let accumulated = "";
    if (!stoppedRef.current.has(localId)) {
      for await (const chunk of streamAssistantReply()) {
        if (stoppedRef.current.has(localId)) break;
        accumulated += chunk;
        const snapshot = accumulated;
        setDisplayMessages((previous) =>
          previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { ...entry, content: snapshot, phase: null } : entry)),
        );
      }
    }

    const wasStopped = stoppedRef.current.delete(localId);

    if (wasStopped && accumulated.length === 0) {
      logger.info("generation stopped before any content arrived", { correlationId, conversationId });
      trackEvent("conversation_message_stream_stopped", { correlationId, properties: { conversationId, hadContent: false } });
      setDisplayMessages((previous) => previous.filter((entry) => !(entry.kind === "streaming" && entry.localId === localId)));
      return;
    }

    if (wasStopped) {
      logger.info("generation stopped, persisting partial content", { correlationId, conversationId, length: accumulated.length });
      trackEvent("conversation_message_stream_stopped", { correlationId, properties: { conversationId, hadContent: true } });
    }

    const result = await receiveAssistantReply(conversationId, accumulated);

    if (!result.ok) {
      logger.error("failed to persist assistant reply", { correlationId, conversationId, code: result.error.code });
      trackEvent("conversation_message_stream_failure", { correlationId, properties: { code: result.error.code } });
      setDisplayMessages((previous) =>
        previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { kind: "stream-failed", localId } : entry)),
      );
      return;
    }

    logger.info("assistant reply received", { correlationId, conversationId, messageId: result.value.id });
    trackEvent("conversation_message_stream_success", { correlationId, properties: { messageId: result.value.id } });
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "streaming" && entry.localId === localId ? { kind: "sent", message: result.value } : entry)),
    );
  }

  function startStream() {
    const localId = crypto.randomUUID();
    setDisplayMessages((previous) => [...previous, { kind: "streaming", localId, content: "", phase: null }]);
    void runStream(localId);
  }

  function handleRetryStream(localId: string) {
    setDisplayMessages((previous) =>
      previous.map((entry) =>
        entry.kind === "stream-failed" && entry.localId === localId ? { kind: "streaming", localId, content: "", phase: null } : entry,
      ),
    );
    void runStream(localId);
  }

  function handleStop(localId: string) {
    stoppedRef.current.add(localId);
  }

  async function handleRegenerate(messageId: string) {
    await deleteMessage(messageId);

    const localId = crypto.randomUUID();
    setDisplayMessages((previous) =>
      previous.map((entry) => (entry.kind === "sent" && entry.message.id === messageId ? { kind: "streaming", localId, content: "", phase: null } : entry)),
    );
    void runStream(localId);
  }

  function handleCitationClick(citationId: string) {
    setPreviewCitationId(citationId);
  }

  function handleClosePreview() {
    setPreviewCitationId(null);
  }

  const isTurnInFlight = displayMessages.some((entry) => entry.kind === "pending" || entry.kind === "streaming");
  const sentMessageCount = displayMessages.filter((entry) => entry.kind === "sent").length;

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
          {displayMessages.map((entry, index) => {
            const isLastEntry = index === displayMessages.length - 1;

            if (entry.kind === "stream-failed") {
              return (
                <li key={entry.localId}>
                  <span>AI</span>
                  <span role="alert">AI 回覆失敗</span>
                  <button type="button" onClick={() => handleRetryStream(entry.localId)}>
                    重新產生回覆
                  </button>
                </li>
              );
            }

            const key = entry.kind === "sent" ? entry.message.id : entry.localId;
            const role = entry.kind === "sent" ? entry.message.role : entry.kind === "streaming" ? "assistant" : "user";
            const roleLabel = role === "assistant" ? "AI" : "你";
            const content = entry.kind === "sent" ? entry.message.content : entry.content;
            const attachmentNames = entry.kind === "sent" ? entry.message.attachmentNames : entry.kind === "streaming" ? [] : entry.attachmentNames;

            return (
              <li key={key}>
                <span>{roleLabel}</span>
                <span>
                  <MessageContent content={content} withCitations={role === "assistant"} onCitationClick={handleCitationClick} />
                </span>
                {attachmentNames.length > 0 && <span>（附件：{attachmentNames.join("、")}）</span>}
                {entry.kind === "sent" && role === "assistant" && isLastEntry && (
                  <button type="button" onClick={() => handleRegenerate(entry.message.id)}>
                    重新產生
                  </button>
                )}
                {entry.kind === "pending" && <span role="status">傳送中…</span>}
                {entry.kind === "streaming" && (
                  <span>
                    <span role="status">{entry.phase ? GENERATION_PHASE_LABELS[entry.phase] : "AI 回覆中…"}</span>
                    <button type="button" onClick={() => handleStop(entry.localId)}>
                      停止生成
                    </button>
                  </span>
                )}
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
      <CitationPreviewDrawer citationId={previewCitationId} onClose={handleClosePreview} />
      {displayMessages.length > 0 && <ConversationContextIndicator messageCount={sentMessageCount} />}
      <MessageComposer conversationId={conversationId} onSubmit={handleComposerSubmit} disabled={isTurnInFlight} />
    </div>
  );
}
