/**
 * E13-S009: usage event instrumentation. E11-S021 (Usage dashboard)
 * already established that `getUsageMetrics()` must stay honestly at
 * `{ 0, 0 }` until E13-S009/S010/S012 give it a real event source — this
 * file is that source. `trackEvent` (telemetry.ts) already fires a
 * structured event at every meaningful action in this codebase, but it
 * is deliberately fire-and-forget (routed through the logger only, per
 * its own doc comment) and nothing persists it anywhere queryable. A
 * future DAU/questions-asked aggregation (E13-S010/S012) needs to read
 * back "which user did what, when" — that requires an actual store, not
 * a log line. `recordUsageEvent` adds exactly that: a minimal, queryable
 * persistence layer, kept separate from trackEvent rather than folded
 * into it, since trackEvent's ~50+ existing call sites (login attempts,
 * maintenance session steps, etc.) are UI/feature telemetry, not all of
 * them meaningful "usage" for DAU/questions purposes — conflating the
 * two would force every existing trackEvent call site to also decide
 * whether it should be persisted, well outside this story's scope.
 *
 * Scope is deliberately narrow: only `"conversation_message_sent"` is
 * instrumented (wired into message-thread.tsx's attemptSend, right
 * where it already fires `conversation_message_send_success`) — this is
 * the single event that most directly corresponds to E11-S021's
 * "questionsAsked" metric. Computing DAU or wiring this into the admin
 * dashboard is explicitly out of scope (E13-S010/S012's job, per Atomic
 * Story Boundary's "one story, one capability" rule) — a future story
 * can derive "was this user active today" from the same event stream
 * this one persists, without needing a second, separate "page view"
 * event type invented here.
 */
export type UsageEventName = "conversation_message_sent";

export interface UsageEvent {
  name: UsageEventName;
  userId: string;
  occurredAt: string;
}

const STORAGE_KEY = "ai-km:mock-usage-events";

/** Same sessionStorage-backed reasoning as messages.ts's readStore/writeStore. */
function readStore(): UsageEvent[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UsageEvent[];
  } catch {
    return [];
  }
}

function writeStore(events: UsageEvent[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

/**
 * Persists one usage event. Deliberately synchronous and never throws —
 * same "must never block or fail the caller's own flow" rule trackEvent
 * documents (AC 4/5: a dependency issue here must not corrupt an
 * unrelated user action, e.g. a full sessionStorage must not make
 * message sending itself appear to fail).
 */
export function recordUsageEvent(name: UsageEventName, userId: string): void {
  try {
    const events = readStore();
    events.push({ name, userId, occurredAt: new Date().toISOString() });
    writeStore(events);
  } catch {
    // Swallowed deliberately — see doc comment above.
  }
}

/** All recorded usage events, oldest first. Read-only accessor for future aggregation stories (E13-S010/S012). */
export function listUsageEvents(): UsageEvent[] {
  return readStore();
}
