import type { ConversationsComponents } from "@ai-km/api-client";

export type ChangeEvent = ConversationsComponents["schemas"]["ChangeEvent"];
export type ResyncReason = ConversationsComponents["schemas"]["ResyncEvent"]["reason"];

/**
 * The `resync` control frame (contracts/events/conversation-change-events.md
 * §5) is not a `ChangeEvent` — it carries no `id`/`conversationId` and means
 * "discard local state, re-fetch everything relevant" rather than "this one
 * thing changed". Folded into the same discriminated union as ChangeEvent
 * (keyed on the same `type` field the SSE frame's own `event:` line already
 * uses) so every consumer has exactly one subscribe channel to reason about.
 */
export type ConversationEvent = ChangeEvent | { type: "resync"; reason: ResyncReason };

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "closed";

const CHANGE_EVENT_TYPES = ["conversation.created", "conversation.updated", "conversation.deleted", "message.created", "message.updated"] as const;

/**
 * The subset of the native `EventSource` DOM API this module actually
 * uses. jsdom has no `EventSource` at all, so production and tests both go
 * through `EventSourceFactory` — production's default implementation
 * constructs a real one; tests inject a fake implementing just this shape.
 */
export interface EventSourceLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  close(): void;
}

export type EventSourceFactory = (url: string, init: { withCredentials: boolean }) => EventSourceLike;

/**
 * A permanently-"connecting", never-delivering stub. Used when the native
 * `EventSource` global isn't available — Next.js SSR (Node has no
 * `EventSource`) and jsdom (`ConversationEventsProvider`'s own doc comment
 * — this module's tests inject a fake instead) both hit this path. This is
 * not a test-only accommodation: a "use client" component's function body
 * still runs during SSR, so production code needs the exact same guard
 * regardless of jsdom. A real client-side mount always has a real
 * `EventSource` global and never reaches this branch.
 */
function createInertEventSource(): EventSourceLike {
  return {
    readyState: 0,
    onopen: null,
    onerror: null,
    addEventListener() {},
    close() {},
  };
}

const defaultEventSourceFactory: EventSourceFactory = (url, init) =>
  typeof EventSource === "undefined" ? createInertEventSource() : (new EventSource(url, init) as unknown as EventSourceLike);

export interface ConversationEventSource {
  /** Registers `handler` for every ChangeEvent/resync frame. Returns an unsubscribe function. */
  subscribe(handler: (event: ConversationEvent) => void): () => void;
  /** Registers `handler` for connection-status transitions. Returns an unsubscribe function. */
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
  status(): ConnectionStatus;
  /** Closes the underlying connection. Idempotent. */
  close(): void;
}

/**
 * E03-S039. Wraps a single native `EventSource` against
 * `GET /conversations/events` (contracts/openapi/conversations.yaml).
 * Reconnection and `Last-Event-ID` replay are entirely the browser's own
 * job (native `EventSource` behavior) — this module only derives a
 * consumer-friendly `ConnectionStatus` from open/error, and de-duplicates
 * ChangeEvents by id (AC6) since a replay after a reconnect could otherwise
 * hand a consumer the same id twice.
 */
export function createConversationEventSource(options: { url: string; eventSourceFactory?: EventSourceFactory }): ConversationEventSource {
  const { url, eventSourceFactory = defaultEventSourceFactory } = options;

  let status: ConnectionStatus = "connecting";
  let closed = false;
  let highestSeenId = 0;
  const changeHandlers = new Set<(event: ConversationEvent) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();

  function setStatus(next: ConnectionStatus) {
    if (status === next) return;
    status = next;
    for (const handler of statusHandlers) handler(status);
  }

  const native = eventSourceFactory(url, { withCredentials: true });

  native.onopen = () => setStatus("open");
  native.onerror = () => {
    setStatus(native.readyState === 2 /* CLOSED */ ? "closed" : "reconnecting");
  };

  for (const type of CHANGE_EVENT_TYPES) {
    native.addEventListener(type, (event) => {
      if (closed) return;
      const parsed = JSON.parse(event.data) as ChangeEvent;
      if (parsed.id <= highestSeenId) return;
      highestSeenId = parsed.id;
      for (const handler of changeHandlers) handler(parsed);
    });
  }

  native.addEventListener("resync", (event) => {
    if (closed) return;
    const parsed = JSON.parse(event.data) as { reason: ResyncReason };
    const resyncEvent: ConversationEvent = { type: "resync", reason: parsed.reason };
    for (const handler of changeHandlers) handler(resyncEvent);
  });

  return {
    subscribe(handler) {
      changeHandlers.add(handler);
      return () => {
        changeHandlers.delete(handler);
      };
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => {
        statusHandlers.delete(handler);
      };
    },
    status() {
      return status;
    },
    close() {
      closed = true;
      native.close();
      setStatus("closed");
    },
  };
}
