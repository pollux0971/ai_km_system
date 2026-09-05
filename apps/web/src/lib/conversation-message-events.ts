/**
 * 11-app-shell/phase-3, #40. Same-tab counterpart to
 * `conversation-events-context.tsx`'s SSE-backed cross-TAB subscription:
 * that one tells other browser windows a conversation's messages changed;
 * this tells other COMPONENTS in the same tab. `ConversationRelatedPanel`
 * only fetches on mount/`conversationId` change, so without this it has no
 * way to learn that a message this tab itself just sent (attachment,
 * citations) exists until a reload or an unrelated remount — the same
 * "panel is stale" bug #40 names for attachments, now also true of
 * citations sourced from `message.citations` instead of parsing `[N]`
 * markers. Deliberately NOT reusing `conversation-events-context`: that
 * module requires a `ConversationEventsProvider` (a real or fake
 * `EventSource`) mounted above it, which is infrastructure for a
 * genuinely different problem (another browser tab/window finding out),
 * not two sibling components in the SAME tab/render tree.
 *
 * Deliberately its OWN module, not folded into `lib/messages.ts` — several
 * existing test files mock `@/lib/messages` with a hand-written object
 * listing specific exports rather than spreading the real module (predating
 * this phase), so adding new exports there would make every one of those
 * `undefined` the moment any code path reached them, breaking tests that
 * have nothing to do with this feature. A module nothing already mocks has
 * no such blast radius.
 */
const messagesChangedListeners = new Map<string, Set<() => void>>();

export function notifyMessagesChanged(conversationId: string): void {
  for (const listener of messagesChangedListeners.get(conversationId) ?? []) listener();
}

export function subscribeToMessagesChanged(conversationId: string, listener: () => void): () => void {
  let listeners = messagesChangedListeners.get(conversationId);
  if (!listeners) {
    listeners = new Set();
    messagesChangedListeners.set(conversationId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
