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

interface SubscribeContextValue {
  subscribe(handler: (event: ConversationEvent) => void): () => void;
}

/**
 * Split into two contexts deliberately. `subscribe`'s identity is stable
 * for the whole component lifetime (recreated only if `activeSource`
 * itself changes, which happens once — see the provider below), so
 * `useConversationEvents` never needs to tear down and resubscribe on
 * every connection-status flicker. `status` changes far more often
 * (connecting → open, and on any reconnect) and re-renders only whoever
 * actually reads it (`useConversationConnectionStatus`, i.e. the
 * header's indicator) — not every `useConversationEvents` consumer.
 */
const SubscribeContext = createContext<SubscribeContextValue | null>(null);
const StatusContext = createContext<ConnectionStatus | null>(null);

/**
 * E03-S039. Mounted once, inside `(app)/session-gate.tsx`'s authenticated
 * subtree — one `EventSource` per tab for as long as a session exists;
 * unmounting (logout, or the whole authenticated tree going away) closes
 * it via the cleanup below, satisfying the Security AC that a logged-out
 * tab must stop receiving events.
 *
 * The real `EventSource` is created inside a `useEffect`, NOT a lazy
 * `useState` initializer. An earlier version of this file used
 * `useState(() => source ?? createConversationEventSource(...))` on the
 * (reasonable-looking) theory that a lazy initializer runs "exactly once
 * per mount." That is true for the STATE React keeps, but React 18
 * StrictMode's development-only double-invocation of lazy initializers
 * has NO cleanup guarantee between the two calls — unlike effects, which
 * are specifically double-invoked as mount → cleanup → mount. Since
 * `createConversationEventSource` has a real side effect (opening a
 * network connection), the lazy-initializer version silently opened TWO
 * independent `EventSource` connections per page in dev mode, kept only
 * one as React state, and leaked the other forever, live, never
 * subscribed to — found via `.e2e.owner`-style deliberate reproduction:
 * an event-arrival log showed `handlerCount: 0` for one connection while
 * the (correctly subscribed) other connection received the exact same
 * event moments apart. `useEffect` gets StrictMode's cleanup-in-between
 * guarantee for free, which is exactly what side-effecting setup needs.
 */
export function ConversationEventsProvider({ children, source }: { children: ReactNode; source?: ConversationEventSourceLike }) {
  const [activeSource, setActiveSource] = useState<ConversationEventSourceLike | null>(null);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  useEffect(() => {
    const instance = source ?? createConversationEventSource({ url: `${resolveApiBaseUrl()}/conversations/events` });
    setActiveSource(instance);
    setStatus(instance.status());
    const unsubscribeStatus = instance.onStatusChange(setStatus);
    return () => {
      unsubscribeStatus();
      instance.close();
    };
  }, [source]);

  const subscribeValue = useMemo<SubscribeContextValue | null>(
    () => (activeSource ? { subscribe: (handler: (event: ConversationEvent) => void) => activeSource.subscribe(handler) } : null),
    [activeSource],
  );

  return (
    <SubscribeContext.Provider value={subscribeValue}>
      <StatusContext.Provider value={status}>{children}</StatusContext.Provider>
    </SubscribeContext.Provider>
  );
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
 *
 * `context` is included in the effect's own dependency list ALONGSIDE the
 * caller's `deps` (not just `deps` alone) — the provider's `subscribe`
 * context starts `null` and only becomes non-null once its own effect has
 * run (see `ConversationEventsProvider` above), so a consumer mounted in
 * the same tick must react to that context becoming available even when
 * its own `deps` never change after mount; omitting `context` here would
 * mean the very first (null-context) run permanently skips subscribing.
 */
export function useConversationEvents(handler: (event: ConversationEvent) => void, deps: DependencyList): void {
  const context = useContext(SubscribeContext);
  useEffect(() => {
    if (!context) return undefined;
    return context.subscribe(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `deps` is the caller's own dependency list, exactly like useEffect's second argument; `context` is added deliberately, see doc comment above.
  }, [context, ...deps]);
}

/** Reactive connection status for the header's sync indicator. `null` outside any provider (or before the provider's own effect has run). */
export function useConversationConnectionStatus(): ConnectionStatus | null {
  return useContext(StatusContext);
}

/** True when `event.originClientId` names this tab's own client id — AC3's "own-tab event, skip refetch" check. */
export function isOwnClientEvent(event: ConversationEvent): boolean {
  return "originClientId" in event && event.originClientId === apiClient.clientId;
}
