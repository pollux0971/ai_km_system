"use client";

import { createContext, useContext, useEffect, useMemo, useState, type DependencyList, type ReactNode } from "react";
import { apiClient } from "./api";
import { createConversationEventSource, type ConnectionStatus, type ConversationEvent } from "./conversation-events";

/** The subset of `ConversationEventSource` this module actually consumes — narrowed so tests can inject a hand-rolled fake without depending on the real EventSource-backed implementation. */
export interface ConversationEventSourceLike {
  subscribe(handler: (event: ConversationEvent) => void): () => void;
  onStatusChange(handler: (status: ConnectionStatus) => void): () => void;
  status(): ConnectionStatus;
  close(): void;
}

/**
 * Mirrors `apps/web/src/lib/api.ts`'s own `NEXT_PUBLIC_API_BASE_URL ??
 * "/api/v1"` default. Not imported from there because that module exports
 * only the built singleton `apiClient`, not the base-url string itself —
 * duplicating a one-line env-var default is cheaper than widening that
 * module's exports for a story boundary that doesn't otherwise touch it.
 */
function resolveApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";
}

interface ConversationEventsContextValue {
  subscribe(handler: (event: ConversationEvent) => void): () => void;
  status: ConnectionStatus;
}

const ConversationEventsContext = createContext<ConversationEventsContextValue | null>(null);

/**
 * E03-S039. Mounted once, inside `(app)/session-gate.tsx`'s authenticated
 * subtree — one `EventSource` per tab for as long as a session exists;
 * unmounting (logout, or the whole authenticated tree going away) closes
 * it via the cleanup below, satisfying the Security AC that a logged-out
 * tab must stop receiving events.
 *
 * `source` is an escape hatch for tests only (an injected
 * `ConversationEventSourceLike`, see conversation-events-context.test.tsx)
 * — production code never passes it, so `createConversationEventSource`
 * runs against a real `EventSource`. Lazy `useState` initializer: created
 * exactly once per mount regardless of re-renders, never recreated even if
 * a later render passes a different `source` (irrelevant in production,
 * where the prop is never passed at all).
 */
export function ConversationEventsProvider({ children, source }: { children: ReactNode; source?: ConversationEventSourceLike }) {
  const [activeSource] = useState<ConversationEventSourceLike>(
    () => source ?? createConversationEventSource({ url: `${resolveApiBaseUrl()}/conversations/events` }),
  );
  const [status, setStatus] = useState<ConnectionStatus>(() => activeSource.status());

  useEffect(() => {
    const unsubscribe = activeSource.onStatusChange(setStatus);
    return () => {
      unsubscribe();
      activeSource.close();
    };
  }, [activeSource]);

  const value = useMemo<ConversationEventsContextValue>(
    () => ({ subscribe: (handler: (event: ConversationEvent) => void) => activeSource.subscribe(handler), status }),
    [activeSource, status],
  );

  return <ConversationEventsContext.Provider value={value}>{children}</ConversationEventsContext.Provider>;
}

/**
 * Subscribes `handler` to every ChangeEvent/resync frame for as long as
 * the calling component is mounted, re-subscribing whenever `deps`
 * changes — the same shape as `useEffect(fn, deps)` itself, so a caller
 * whose handler closes over changing props/state (e.g. `conversationId`)
 * passes it in `deps` instead of needing its own `useCallback`. Outside
 * any `ConversationEventsProvider` (e.g. a unit test rendering the
 * component alone) this is a silent no-op, not a throw — every one of the
 * 5 consumer components already has its own pre-existing tests that don't
 * wrap in this provider, and those must keep passing unmodified.
 */
export function useConversationEvents(handler: (event: ConversationEvent) => void, deps: DependencyList): void {
  const context = useContext(ConversationEventsContext);
  useEffect(() => {
    if (!context) return undefined;
    return context.subscribe(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's own dependency list, exactly like useEffect's second argument.
  }, deps);
}

/** Reactive connection status for the header's sync indicator. `null` outside any provider. */
export function useConversationConnectionStatus(): ConnectionStatus | null {
  const context = useContext(ConversationEventsContext);
  return context ? context.status : null;
}

/** True when `event.originClientId` names this tab's own client id — AC3's "own-tab event, skip refetch" check. */
export function isOwnClientEvent(event: ConversationEvent): boolean {
  return "originClientId" in event && event.originClientId === apiClient.clientId;
}
