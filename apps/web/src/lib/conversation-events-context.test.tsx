// @vitest-environment jsdom
import { useState } from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  ConversationEventsProvider,
  useConversationConnectionStatus,
  useConversationEvents,
  type ConversationEventSourceLike,
} from "./conversation-events-context";
import type { ConnectionStatus, ConversationEvent } from "./conversation-events";

/**
 * E03-S039. A hand-rolled fake `ConversationEventSource` — the context
 * module only ever calls `subscribe`/`onStatusChange`/`status`/`close`, so
 * the fake implements exactly that surface plus an `emit`/`setStatus` test
 * helper, independent of the real EventSource-backed implementation
 * (already covered by conversation-events.test.ts).
 */
function makeFakeSource(): ConversationEventSourceLike & { emit(event: ConversationEvent): void; setStatus(status: ConnectionStatus): void } {
  const changeHandlers = new Set<(event: ConversationEvent) => void>();
  const statusHandlers = new Set<(status: ConnectionStatus) => void>();
  let status: ConnectionStatus = "connecting";
  return {
    subscribe(handler) {
      changeHandlers.add(handler);
      return () => changeHandlers.delete(handler);
    },
    onStatusChange(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
    status: () => status,
    close: vi.fn(),
    emit(event) {
      for (const handler of changeHandlers) handler(event);
    },
    setStatus(next) {
      status = next;
      for (const handler of statusHandlers) handler(status);
    },
  };
}

function Listener({ onEvent }: { onEvent: (event: ConversationEvent) => void }) {
  useConversationEvents(onEvent, []);
  return null;
}

function StatusReadout() {
  const status = useConversationConnectionStatus();
  return <span data-testid="status">{status ?? "no-provider"}</span>;
}

describe("ConversationEventsProvider / useConversationEvents", () => {
  it("delivers events emitted on the source to a subscribed consumer", () => {
    const source = makeFakeSource();
    const received: ConversationEvent[] = [];

    render(
      <ConversationEventsProvider source={source}>
        <Listener onEvent={(event) => received.push(event)} />
      </ConversationEventsProvider>,
    );

    act(() => {
      source.emit({ id: 1, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "conversation.created", conversationId: "c1" });
  });

  it("useConversationEvents outside any provider is a silent no-op (never throws)", () => {
    const handler = vi.fn();
    expect(() => render(<Listener onEvent={handler} />)).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("re-subscribes when the caller's deps change, and drops the old handler", () => {
    const source = makeFakeSource();
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    function Harness() {
      const [which, setWhich] = useState<"first" | "second">("first");
      useConversationEvents(which === "first" ? firstHandler : secondHandler, [which]);
      return (
        <button type="button" onClick={() => setWhich("second")}>
          switch
        </button>
      );
    }

    render(
      <ConversationEventsProvider source={source}>
        <Harness />
      </ConversationEventsProvider>,
    );

    act(() => {
      source.emit({ id: 1, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole("button", { name: "switch" }).click();
    });
    act(() => {
      source.emit({ id: 2, type: "conversation.created", conversationId: "c2", occurredAt: "2026-08-29T00:00:01.000Z" });
    });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes every consumer when the component unmounts", () => {
    const source = makeFakeSource();
    const handler = vi.fn();
    const { unmount } = render(
      <ConversationEventsProvider source={source}>
        <Listener onEvent={handler} />
      </ConversationEventsProvider>,
    );

    unmount();
    source.emit({ id: 1, type: "conversation.created", conversationId: "c1", occurredAt: "2026-08-29T00:00:00.000Z" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("closes the event source on unmount (E03-S039 Security AC: logout must stop receiving events)", () => {
    const source = makeFakeSource();
    const { unmount } = render(
      <ConversationEventsProvider source={source}>
        <Listener onEvent={() => {}} />
      </ConversationEventsProvider>,
    );

    unmount();

    expect(source.close).toHaveBeenCalledTimes(1);
  });

  it("useConversationConnectionStatus reads the live status and updates on transitions", () => {
    const source = makeFakeSource();
    render(
      <ConversationEventsProvider source={source}>
        <StatusReadout />
      </ConversationEventsProvider>,
    );

    expect(screen.getByTestId("status")).toHaveTextContent("connecting");

    act(() => {
      source.setStatus("open");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("open");

    act(() => {
      source.setStatus("reconnecting");
    });
    expect(screen.getByTestId("status")).toHaveTextContent("reconnecting");
  });

  it("useConversationConnectionStatus outside any provider reads null, not a crash", () => {
    render(<StatusReadout />);
    expect(screen.getByTestId("status")).toHaveTextContent("no-provider");
  });
});
