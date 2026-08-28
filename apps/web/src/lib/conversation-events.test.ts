import { describe, expect, it, vi } from "vitest";
import { createConversationEventSource, type EventSourceFactory, type EventSourceLike } from "./conversation-events";

/**
 * E03-S039. jsdom has no EventSource, so the lib takes an injectable
 * factory (`EventSourceFactory`) — this fake mirrors just the surface
 * `createConversationEventSource` actually uses (readyState,
 * onopen/onerror, addEventListener, close), with an `emit` test helper to
 * drive named SSE frames the way a real browser would dispatch them.
 */
function makeFakeEventSource() {
  const listeners = new Map<string, Set<(event: MessageEvent) => void>>();
  const fake: EventSourceLike & { emit(type: string, data: unknown): void } = {
    readyState: 0,
    onopen: null,
    onerror: null,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    close: vi.fn(() => {
      fake.readyState = 2;
    }),
    emit(type, data) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ data: JSON.stringify(data) } as MessageEvent);
      }
    },
  };
  return fake;
}

function makeFactory() {
  const instances: ReturnType<typeof makeFakeEventSource>[] = [];
  const factory: EventSourceFactory = (url, init) => {
    const instance = makeFakeEventSource();
    instances.push(Object.assign(instance, { url, init }) as never);
    return instance;
  };
  return { factory, instances };
}

describe("createConversationEventSource", () => {
  it("opens the given url with withCredentials:true", () => {
    const { factory, instances } = makeFactory();
    createConversationEventSource({ url: "/api/v1/conversations/events", eventSourceFactory: factory });

    expect(instances).toHaveLength(1);
    expect((instances[0] as unknown as { url: string }).url).toBe("/api/v1/conversations/events");
    expect((instances[0] as unknown as { init: { withCredentials: boolean } }).init).toEqual({ withCredentials: true });
  });

  it("starts in 'connecting' status", () => {
    const { factory } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });

    expect(source.status()).toBe("connecting");
  });

  it("transitions to 'open' when the native source opens", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });

    instances[0]!.onopen?.(new Event("open"));

    expect(source.status()).toBe("open");
  });

  it("transitions to 'reconnecting' on error after having been open, then back to 'open' on reopen", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const statuses: string[] = [];
    source.onStatusChange((status) => statuses.push(status));

    instances[0]!.onopen?.(new Event("open"));
    instances[0]!.onerror?.(new Event("error"));
    expect(source.status()).toBe("reconnecting");

    instances[0]!.onopen?.(new Event("open"));
    expect(source.status()).toBe("open");

    expect(statuses).toEqual(["open", "reconnecting", "open"]);
  });

  it("transitions to 'closed' and stops notifying once close() is called", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });

    source.close();

    expect(source.status()).toBe("closed");
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);

    const handler = vi.fn();
    source.subscribe(handler);
    instances[0]!.emit("conversation.created", { id: 1, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });
    expect(handler).not.toHaveBeenCalled();
  });

  const CHANGE_EVENT_TYPES = ["conversation.created", "conversation.updated", "conversation.deleted", "message.created", "message.updated"] as const;

  it.each(CHANGE_EVENT_TYPES)("delivers a %s frame to subscribers with its parsed payload", (type) => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handler = vi.fn();
    source.subscribe(handler);

    const payload = { id: 7, type, conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" };
    instances[0]!.emit(type, payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("delivers a resync frame to subscribers as { type: 'resync', reason }", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handler = vi.fn();
    source.subscribe(handler);

    instances[0]!.emit("resync", { reason: "EVENT_LOG_TRUNCATED" });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: "resync", reason: "EVENT_LOG_TRUNCATED" });
  });

  it("only processes a given ChangeEvent id once (AC6): a duplicate/replayed id is not redelivered", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handler = vi.fn();
    source.subscribe(handler);

    const event = { id: 5, type: "conversation.created" as const, conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" };
    instances[0]!.emit("conversation.created", event);
    instances[0]!.emit("conversation.created", event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("still delivers a strictly-increasing id after a lower/equal duplicate was dropped", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handler = vi.fn();
    source.subscribe(handler);

    instances[0]!.emit("conversation.created", { id: 5, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });
    instances[0]!.emit("conversation.created", { id: 5, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });
    instances[0]!.emit("conversation.updated", { id: 6, type: "conversation.updated", conversationId: "c1", occurredAt: "2026-08-29T00:00:01.000Z" });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("never dedupes resync frames (they carry no id)", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handler = vi.fn();
    source.subscribe(handler);

    instances[0]!.emit("resync", { reason: "SERVER_RESTART" });
    instances[0]!.emit("resync", { reason: "SERVER_RESTART" });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("unsubscribe stops delivery to that handler only", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    const unsubscribeA = source.subscribe(handlerA);
    source.subscribe(handlerB);

    unsubscribeA();
    instances[0]!.emit("conversation.created", { id: 1, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it("without an injected factory and no global EventSource (SSR/jsdom), stays inertly 'connecting' instead of throwing", () => {
    expect(typeof EventSource).toBe("undefined");

    expect(() => createConversationEventSource({ url: "/events" })).not.toThrow();
    const source = createConversationEventSource({ url: "/events" });
    expect(source.status()).toBe("connecting");
    expect(() => source.close()).not.toThrow();
  });

  it("close() is idempotent — calling it twice does not throw or open a second connection", () => {
    const { factory, instances } = makeFactory();
    const source = createConversationEventSource({ url: "/events", eventSourceFactory: factory });

    source.close();
    source.close();

    expect(instances).toHaveLength(1);
    expect(instances[0]!.close).toHaveBeenCalledTimes(2);
  });
});
