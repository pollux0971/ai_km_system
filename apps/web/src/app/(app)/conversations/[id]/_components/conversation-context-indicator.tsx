/**
 * E03-S018: conversation context indicator. SOURCE_BASELINE.md gives
 * this story only its title (line 1188, "E03-S18 Conversation
 * Context") — no body at all. The epic file's expanded title,
 * "Conversation context indicator", is decisive here (same precedent
 * as S12/S14/S15/S17's expanded titles grounding their concrete UI
 * pattern): "indicator" reframes this as a transparency/display
 * feature, not a request to actually wire real conversation history
 * into a model call. There is no real Model Gateway or RAG platform
 * (E04/E12, Team B, don't exist) — lib/streaming.ts's
 * streamAssistantReply() deliberately takes no prompt argument, and
 * this story doesn't touch that; it only shows the user how much
 * history currently exists, honestly labeled as what WOULD be
 * available as context, not a claim that a real model is using it.
 *
 * A pure presentational component driven by a `messageCount` prop the
 * parent (message-thread.tsx) already has computed from its own
 * `displayMessages` state — not an independent data-fetcher. Fetching
 * its own copy of the message list would duplicate what the parent
 * already loaded and risk drifting out of sync with the parent's own
 * optimistic updates; this component only ever reflects what its
 * caller tells it.
 *
 * Counts only `kind: "sent"` entries (see message-thread.tsx) — a
 * message still `pending` or an assistant reply still `streaming`
 * isn't persisted yet, so it isn't genuinely part of the history a
 * real backend could include as context. This is the only
 * unambiguous, already-established unit to count in ("則訊息",
 * matching the existing empty-state copy "尚無訊息，開始對話吧。")
 * rather than inventing a "turns" unit or a specific context-window
 * truncation limit — SOURCE_BASELINE defines no such number, and
 * fabricating one (e.g. "only the last 10 messages") would be
 * inventing behavior with nothing to ground it.
 *
 * No live-region role — the count changes every time a message
 * settles, and proactively interrupting screen reader users on every
 * single send would be noisy, not helpful; unlike `role="status"`
 * elsewhere in this codebase (e.g. "傳送中…"), this isn't reporting
 * the outcome of an action the user just took, so there's nothing
 * time-sensitive to announce.
 */
export function ConversationContextIndicator({ messageCount }: { messageCount: number }) {
  if (messageCount === 0) {
    return <p>上下文：目前尚無先前訊息。</p>;
  }
  return <p>上下文：包含 {messageCount} 則先前訊息。</p>;
}
