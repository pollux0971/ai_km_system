import type { AnswerState } from "./answer-state";

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
 * E13-S009 scope was deliberately narrow: only `"conversation_message_sent"`
 * (wired into message-thread.tsx's attemptSend, right where it already
 * fires `conversation_message_send_success`) — the single event that most
 * directly corresponds to E11-S021's "questionsAsked" metric.
 *
 * E13-S010 adds `"conversation_created"` — the other half of the same
 * "questionsAsked"-adjacent DAU signal: starting a brand-new conversation
 * (either via `/conversations/new`'s zero-interaction auto-create, or
 * `/conversations/new-file`'s file-first entry) is the other basic
 * "this user was active" action in this codebase. Recorded only once the
 * conversation durably exists — `/conversations/new-file`'s rollback path
 * (create succeeds, then the file-attach call fails and the conversation
 * is deleted again) must NOT record an event for a conversation that no
 * longer exists, so instrumentation sits at each route's own final
 * success point, not at createConversation() itself.
 *
 * E13-S011 adds `"rag_answer_outcome"` — a per-answer quality signal,
 * recorded once per successfully-persisted assistant reply (message-
 * thread.tsx's runStream, right where it already fires
 * `conversation_message_stream_success`). This is deliberately NOT an
 * attempt to build real RAG evaluation (retrieval recall, forbidden-
 * source leak rate, etc — TESTING_POLICY.md's L6): that is E04 (RAG &
 * Conversation Intelligence)'s domain, explicitly owned by Team B
 * (readme_zh.md: "RAG 是獨立 Domain"; SOURCE_BASELINE.md's E04-S21
 * Abstention / E04-S28 Evaluation Dataset / E04-S29 Retrieval Evaluation
 * are all Team B stories), and this codebase's RAG pipeline itself is a
 * mock (streaming.ts's MOCK_REPLY). What IS genuinely available to Team A
 * without inventing anything is the two RAG-adjacent facts already
 * surfaced by E03-S021's real, already-approved `AnswerState`
 * classification (ANSWERED/PARTIAL/NO_EVIDENCE/ERROR/PERMISSION_DENIED/
 * SOURCE_UNAVAILABLE — NO_EVIDENCE is this codebase's honest stand-in for
 * "abstained") and the `[N]` citation markers already rendered in the
 * reply content (E03-S014's citation badges). Recording those two
 * observable facts per answer — not computing any cross-answer rate or
 * aggregate — is the whole of this story's scope; `countDistinctCitations`
 * below is a pure counting function, not a leak-rate calculator.
 *
 * E13-S012 adds the aggregation layer these three prior stories all
 * deliberately deferred: `computeDAU`/`computeQuestionsAsked` below.
 * Both are pure functions over an already-fetched `UsageEvent[]` — no
 * new storage, no new event type, no new instrumentation call site.
 *
 * Where this aggregation runs, and where it does NOT: `usage-metrics.ts`
 * (apps/admin, E11-S021) explicitly named "E13-S012 DAU/questions
 * dashboard" as its own real-data source, but apps/admin and apps/web
 * are two independent Next.js apps with no real backend between them —
 * each has its own origin-scoped sessionStorage, and nothing in this
 * codebase lets apps/admin read apps/web's `listUsageEvents()`. That is
 * the exact same cross-app boundary E11-S016/E13-S007/E13-S008 already
 * established for Feedback, and it does not change here: this story
 * does NOT touch `apps/admin`, and `getUsageMetrics()` stays honestly
 * at `{ 0, 0 }`. What this story CAN honestly deliver — and does — is
 * proving the aggregation math itself is correct at the one place the
 * real data actually lives (apps/web), so that a future story wiring a
 * real cross-app data path (most plausibly a Team B-provided API) has
 * correct, tested aggregation logic ready to consume rather than having
 * to invent and prove it from scratch.
 *
 * E13-S013 ("latency dashboard") is a different situation from E13-S012:
 * `usage-metrics.ts`'s own doc comment explicitly deferred latency to
 * "E13-S013's own separate future story" WITHOUT any apps/admin page
 * ever being built for it (unlike DAU/questions, which E11-S021 already
 * gave a real presentation layer to — `/usage`). Neither `E11_Admin_
 * Console.md` nor `page.tsx`'s own link list reserves any "latency"
 * page. So the E13-S012 precedent ("the presentation layer already
 * exists elsewhere, adding a second one would be scope creep") does not
 * apply here — with genuinely no dashboard anywhere, delivering only a
 * pure aggregation function would leave this story's own literal name
 * ("dashboard") entirely unmet. This story therefore does BOTH: the
 * measurement (`latencyMs` below, plus its call site in message-
 * thread.tsx's runStream) and `computeAverageLatencyMs`, AND a new
 * honestly-empty `/latency` admin page (apps/admin/src/app/latency),
 * mirroring `/usage`'s own loading/error/loaded shape exactly. The
 * admin page's own `getLatencyMetrics()` still cannot read this file's
 * data (same unbridged cross-app boundary as E13-S012), so it reports
 * `averageLatencyMs: null` honestly rather than fabricating a number —
 * this file's `computeAverageLatencyMs` exists so that a future
 * Team B-provided cross-app data path has correct, tested aggregation
 * logic ready to consume, exactly as E13-S012 already established for
 * DAU/questions.
 *
 * What "latency" honestly means in this codebase: the elapsed time from
 * `runStream`'s own entry (right when a reply starts generating) to the
 * moment its assistant reply is durably persisted — the full duration
 * of generation-status.ts's simulated searching/reading/generating
 * phases plus lib/streaming.ts's simulated token pacing. This is a real,
 * measurable quantity of this mock pipeline's own behavior, not an
 * invented number, but it is NOT a real backend/LLM provider's response
 * time (no such provider exists in this codebase) — that distinction is
 * spelled out in this story's own EVIDENCE, not glossed over.
 */
export type UsageEventName = "conversation_message_sent" | "conversation_created" | "rag_answer_outcome";

export interface UsageEvent {
  name: UsageEventName;
  userId: string;
  occurredAt: string;
  /** Only populated for "rag_answer_outcome" events. */
  answerState?: AnswerState;
  /** Only populated for "rag_answer_outcome" events. */
  citationCount?: number;
  /** Only populated for "rag_answer_outcome" events (E13-S013). */
  latencyMs?: number;
}

/**
 * Independent regex, not imported from message-content.tsx (a "use
 * client" component) — same "pattern-consistent, not shared" precedent
 * messages.ts's own CITATION_ID_PATTERN doc comment already establishes
 * for this exact `[N]` marker format. Counts DISTINCT ids (a citation
 * cited twice in one answer is one source, not two) — matching how a
 * real citation-correctness signal would be defined, not raw marker
 * occurrences.
 */
const CITATION_ID_PATTERN = /\[(\d+)\]/g;

export function countDistinctCitations(content: string): number {
  const ids = new Set<string>();
  for (const match of content.matchAll(CITATION_ID_PATTERN)) {
    const id = match[1];
    if (id !== undefined) ids.add(id);
  }
  return ids.size;
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
 *
 * `details` is optional and only meaningful for `"rag_answer_outcome"` —
 * `conversation_message_sent`/`conversation_created` callers pass
 * nothing, leaving `answerState`/`citationCount`/`latencyMs` undefined on
 * the persisted event rather than defaulted to some stray value.
 *
 * E13-S016 privacy-safe-analytics-fields audit: this is the one function
 * in the codebase that actually persists a `UsageEvent` into the
 * queryable store a future DAU/rate aggregation reads back — the real
 * "analytics" surface this story's name refers to (as opposed to
 * trackEvent, which is fire-and-forget UI telemetry with 50+ unrelated
 * call sites outside this epic's domain, already grepped clean of free
 * text for every feedback/comment-adjacent call site and out of this
 * story's Domain Ownership Boundary to rewrite). Every current call site
 * only ever passes `answerState`/`citationCount`/`latencyMs` — but that
 * safety previously relied entirely on TypeScript's excess-property
 * check on object LITERALS, which does not apply once a caller builds
 * `details` in a variable first. Explicitly picking the three known-safe
 * fields below (instead of spreading `...details`) makes this function
 * itself the enforcement point: even a future call site that
 * accidentally passes an object carrying `comment`/`answerContent` (e.g.
 * copy-pasted from feedback-knowledge-candidates.ts, which legitimately
 * DOES carry free text as a disclosed human-review artifact, not
 * analytics) cannot leak that text into this persisted store.
 */
export function recordUsageEvent(
  name: UsageEventName,
  userId: string,
  details?: { answerState?: AnswerState; citationCount?: number; latencyMs?: number },
): void {
  try {
    const events = readStore();
    events.push({
      name,
      userId,
      occurredAt: new Date().toISOString(),
      answerState: details?.answerState,
      citationCount: details?.citationCount,
      latencyMs: details?.latencyMs,
    });
    writeStore(events);
  } catch {
    // Swallowed deliberately — see doc comment above.
  }
}

/** All recorded usage events, oldest first. Read-only accessor for aggregation (E13-S012). */
export function listUsageEvents(): UsageEvent[] {
  return readStore();
}

/**
 * "Questions asked" (E11-S021's own metric name): total number of
 * conversation_message_sent events in the given event list. Every such
 * event is one real send, so this is a plain count, not a distinct-user
 * count — a user asking 5 questions contributes 5, not 1 (that
 * distinction belongs to DAU below).
 */
export function computeQuestionsAsked(events: UsageEvent[]): number {
  return events.filter((event) => event.name === "conversation_message_sent").length;
}

/**
 * "Daily active users": count of distinct userIds with at least one
 * usage event (any event name) on referenceDate's UTC calendar day —
 * the exact derivation E13-S009's own doc comment already named as its
 * design direction ("this user today had any usage event = active"),
 * now implemented. Comparing by UTC calendar day (not a rolling
 * 24-hour window) matches this codebase's established UTC-storage
 * convention for time fields (occurredAt is already an ISO/UTC
 * timestamp) and gives a stable, unambiguous "today" boundary.
 */
export function computeDAU(events: UsageEvent[], referenceDate: Date): number {
  const referenceDay = referenceDate.toISOString().slice(0, 10);
  const activeUserIds = new Set<string>();
  for (const event of events) {
    if (event.occurredAt.slice(0, 10) === referenceDay) {
      activeUserIds.add(event.userId);
    }
  }
  return activeUserIds.size;
}

/**
 * Average `latencyMs` across every `rag_answer_outcome` event that
 * carries one (E13-S013). Returns `null` — not `0` — when there are no
 * such samples: an average of zero samples is mathematically undefined,
 * and `0` would misread as "answers are instant," the same "a fabricated
 * number is worse than an honest absence" reasoning `usage-metrics.ts`'s
 * own doc comment already applies to `getUsageMetrics()`. A zero-latency
 * sample IS counted (0 is a real elapsed-time value, not a missing one)
 * — only events with no `latencyMs` at all (a different event name, or
 * a rag_answer_outcome recorded before this story existed) are skipped.
 */
export function computeAverageLatencyMs(events: UsageEvent[]): number | null {
  const samples = events
    .filter((event) => event.name === "rag_answer_outcome" && event.latencyMs !== undefined)
    .map((event) => event.latencyMs as number);
  if (samples.length === 0) return null;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}
