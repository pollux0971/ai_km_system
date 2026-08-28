import { describe, expect, it } from "vitest";
import { getRecordedUsageEvents } from "@/test/fake-api";
import {
  computeAverageLatencyMs,
  computeDAU,
  computeQuestionsAsked,
  countDistinctCitations,
  listUsageEvents,
  recordUsageEvent,
  type UsageEvent,
} from "./usage-events";

/**
 * `recordUsageEvent` is deliberately fire-and-forget (E13-S020) — it kicks off a
 * `POST /usage-events` without returning a promise the caller can await. Tests need to
 * wait for that in-flight request to actually reach the fake API (a `setTimeout(0)`
 * macrotask reliably drains the intervening microtask chain: `toResult`'s `await`, the
 * fake `fetch`'s own `await readJsonBody`, etc.) before asserting on
 * `getRecordedUsageEvents()`.
 */
async function flushRecordUsageEvent(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("recordUsageEvent — POST /usage-events (E13-S009, rewritten for E13-S020)", () => {
  it("sends a conversation_message_sent event with name and occurredAt, no userId field on the request", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const events = getRecordedUsageEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("expected an event");
    expect(event.name).toBe("conversation_message_sent");
    expect(() => new Date(event.occurredAt).toISOString()).not.toThrow();
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
    // analytics.yaml: identity comes from the session, never the request body —
    // the fake API's own UsageEventInput ("additionalProperties: false") schema
    // validation would already have thrown had a userId field been sent at all.
    expect(Object.prototype.hasOwnProperty.call(event, "userId")).toBe(false);
  });

  it("accumulates multiple events in the order they were sent", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();
    recordUsageEvent("conversation_message_sent", "u2");
    await flushRecordUsageEvent();
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const events = getRecordedUsageEvents();
    expect(events.map((event) => event.name)).toEqual([
      "conversation_message_sent",
      "conversation_message_sent",
      "conversation_message_sent",
    ]);
  });

  it("never throws even when the request fails with a 500 (AC2) — the caller's own flow is unaffected", async () => {
    const { failNextRequest } = await import("@/test/fake-api");
    failNextRequest("INTERNAL_ERROR");

    expect(() => recordUsageEvent("conversation_message_sent", "u1")).not.toThrow();
    await flushRecordUsageEvent();

    // The forced failure means nothing was actually persisted, and — per AC2 — no
    // retry is attempted: a second flush still finds nothing recorded.
    expect(getRecordedUsageEvents()).toHaveLength(0);
    await flushRecordUsageEvent();
    expect(getRecordedUsageEvents()).toHaveLength(0);
  });

  it("never throws on a real network failure either (AC2), and does not retry", async () => {
    const { failNextRequestWithNetworkError } = await import("@/test/fake-api");
    failNextRequestWithNetworkError();

    expect(() => recordUsageEvent("conversation_message_sent", "u1")).not.toThrow();
    await flushRecordUsageEvent();

    expect(getRecordedUsageEvents()).toHaveLength(0);
  });
});

describe("recordUsageEvent — conversation_created (E13-S010, rewritten for E13-S020)", () => {
  it("sends conversation_created as a distinct event name", async () => {
    recordUsageEvent("conversation_created", "u1");
    await flushRecordUsageEvent();

    const events = getRecordedUsageEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe("conversation_created");
  });

  it("keeps conversation_created and conversation_message_sent distinguishable when both are sent", async () => {
    recordUsageEvent("conversation_created", "u1");
    await flushRecordUsageEvent();
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const events = getRecordedUsageEvents();
    expect(events.map((event) => event.name)).toEqual(["conversation_created", "conversation_message_sent"]);
  });
});

describe("recordUsageEvent — rag_answer_outcome (E13-S011, rewritten for E13-S020)", () => {
  it("sends rag_answer_outcome with its answerState and citationCount", async () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 1 });
    await flushRecordUsageEvent();

    const events = getRecordedUsageEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("expected an event");
    expect(event.name).toBe("rag_answer_outcome");
    expect(event.answerState).toBe("ANSWERED");
    expect(event.citationCount).toBe(1);
  });

  it("sends a non-ANSWERED state (e.g. NO_EVIDENCE) and a zero citationCount distinctly, not defaulted to ANSWERED/1", async () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "NO_EVIDENCE", citationCount: 0 });
    await flushRecordUsageEvent();

    const [event] = getRecordedUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.answerState).toBe("NO_EVIDENCE");
    expect(event.citationCount).toBe(0);
  });

  it("leaves answerState/citationCount absent from the request for events sent without details (conversation_message_sent/conversation_created), not populated with stray values", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const [event] = getRecordedUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.answerState).toBeUndefined();
    expect(event.citationCount).toBeUndefined();
  });
});

describe("recordUsageEvent — latencyMs (E13-S013, rewritten for E13-S020)", () => {
  it("sends latencyMs alongside answerState/citationCount on a rag_answer_outcome event", async () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 1, latencyMs: 1234 });
    await flushRecordUsageEvent();

    const [event] = getRecordedUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.latencyMs).toBe(1234);
  });

  it("sends a zero latencyMs distinctly, not treated as absent", async () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 0, latencyMs: 0 });
    await flushRecordUsageEvent();

    const [event] = getRecordedUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.latencyMs).toBe(0);
  });

  it("leaves latencyMs absent from the request for events sent without it, not defaulted to 0", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const [event] = getRecordedUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.latencyMs).toBeUndefined();
  });
});

describe("countDistinctCitations (E13-S011)", () => {
  it("returns 0 for content with no citation markers", () => {
    expect(countDistinctCitations("這是一段沒有引用的回答。")).toBe(0);
  });

  it("returns 1 for content with a single citation marker", () => {
    expect(countDistinctCitations("這是回答內容。[1]")).toBe(1);
  });

  it("counts distinct citation ids, not raw marker occurrences — a repeated [1] still counts once", () => {
    expect(countDistinctCitations("先引用一次 [1]，後面又引用了同一個來源 [1]。")).toBe(1);
  });

  it("counts multiple distinct citation ids", () => {
    expect(countDistinctCitations("第一個來源 [1]，第二個來源 [2]，第三個來源 [3]。")).toBe(3);
  });
});

function event(name: UsageEvent["name"], userId: string, occurredAt: string, latencyMs?: number): UsageEvent {
  return { name, userId, occurredAt, ...(latencyMs === undefined ? {} : { latencyMs }) };
}

describe("computeQuestionsAsked (E13-S012)", () => {
  it("returns 0 for an empty event list", () => {
    expect(computeQuestionsAsked([])).toBe(0);
  });

  it("counts only conversation_message_sent events, ignoring other event types", () => {
    const events = [
      event("conversation_created", "u1", "2026-08-18T01:00:00.000Z"),
      event("conversation_message_sent", "u1", "2026-08-18T01:00:01.000Z"),
      event("rag_answer_outcome", "u1", "2026-08-18T01:00:02.000Z"),
    ];
    expect(computeQuestionsAsked(events)).toBe(1);
  });

  it("counts every conversation_message_sent event, including repeats from the same user", () => {
    const events = [
      event("conversation_message_sent", "u1", "2026-08-18T01:00:00.000Z"),
      event("conversation_message_sent", "u1", "2026-08-18T02:00:00.000Z"),
      event("conversation_message_sent", "u2", "2026-08-18T03:00:00.000Z"),
    ];
    expect(computeQuestionsAsked(events)).toBe(3);
  });
});

describe("computeDAU (E13-S012)", () => {
  const referenceDate = new Date("2026-08-18T12:00:00.000Z");

  it("returns 0 for an empty event list", () => {
    expect(computeDAU([], referenceDate)).toBe(0);
  });

  it("counts a single user with one event on the reference date as 1", () => {
    const events = [event("conversation_message_sent", "u1", "2026-08-18T01:00:00.000Z")];
    expect(computeDAU(events, referenceDate)).toBe(1);
  });

  it("counts a user only once even with multiple events on the same reference date, regardless of event type", () => {
    const events = [
      event("conversation_created", "u1", "2026-08-18T00:30:00.000Z"),
      event("conversation_message_sent", "u1", "2026-08-18T05:00:00.000Z"),
      event("rag_answer_outcome", "u1", "2026-08-18T05:00:01.000Z"),
    ];
    expect(computeDAU(events, referenceDate)).toBe(1);
  });

  it("counts distinct users independently on the same reference date", () => {
    const events = [
      event("conversation_message_sent", "u1", "2026-08-18T01:00:00.000Z"),
      event("conversation_message_sent", "u2", "2026-08-18T02:00:00.000Z"),
      event("conversation_message_sent", "u3", "2026-08-18T03:00:00.000Z"),
    ];
    expect(computeDAU(events, referenceDate)).toBe(3);
  });

  it("excludes events from a different UTC calendar day, even if less than 24 hours away", () => {
    const events = [
      event("conversation_message_sent", "u1", "2026-08-17T23:59:59.999Z"),
      event("conversation_message_sent", "u2", "2026-08-19T00:00:00.001Z"),
    ];
    expect(computeDAU(events, referenceDate)).toBe(0);
  });

  it("includes events exactly at the reference date's UTC day boundaries", () => {
    const events = [
      event("conversation_message_sent", "u1", "2026-08-18T00:00:00.000Z"),
      event("conversation_message_sent", "u2", "2026-08-18T23:59:59.999Z"),
    ];
    expect(computeDAU(events, referenceDate)).toBe(2);
  });
});

describe("computeAverageLatencyMs (E13-S013)", () => {
  it("returns null for an empty event list — no samples means no honest average, not a fabricated 0", () => {
    expect(computeAverageLatencyMs([])).toBeNull();
  });

  it("returns null when no rag_answer_outcome event carries a latencyMs, even if other events exist", () => {
    const events = [
      event("conversation_created", "u1", "2026-08-18T01:00:00.000Z"),
      event("conversation_message_sent", "u1", "2026-08-18T01:00:01.000Z"),
    ];
    expect(computeAverageLatencyMs(events)).toBeNull();
  });

  it("returns the single value for exactly one sample", () => {
    const events = [event("rag_answer_outcome", "u1", "2026-08-18T01:00:00.000Z", 2000)];
    expect(computeAverageLatencyMs(events)).toBe(2000);
  });

  it("averages multiple rag_answer_outcome samples", () => {
    const events = [
      event("rag_answer_outcome", "u1", "2026-08-18T01:00:00.000Z", 1000),
      event("rag_answer_outcome", "u2", "2026-08-18T02:00:00.000Z", 3000),
    ];
    expect(computeAverageLatencyMs(events)).toBe(2000);
  });

  it("ignores non-rag_answer_outcome events even if they somehow carried a latencyMs value", () => {
    const events = [
      event("conversation_message_sent", "u1", "2026-08-18T01:00:00.000Z", 9999),
      event("rag_answer_outcome", "u1", "2026-08-18T01:00:01.000Z", 1000),
    ];
    expect(computeAverageLatencyMs(events)).toBe(1000);
  });

  it("counts a zero-latency sample toward the average, not treated as missing", () => {
    const events = [
      event("rag_answer_outcome", "u1", "2026-08-18T01:00:00.000Z", 0),
      event("rag_answer_outcome", "u2", "2026-08-18T02:00:00.000Z", 2000),
    ];
    expect(computeAverageLatencyMs(events)).toBe(1000);
  });
});

// E13-S016 privacy-safe analytics fields, carried forward under E13-S020. All of
// E13-S001~S015's telemetry/analytics call sites were individually grepped clean of
// free text (see E13-S016's EVIDENCE for the full field-by-field audit) — every
// current caller of recordUsageEvent passes only literal objects containing
// answerState/citationCount/latencyMs, which TypeScript's excess-property check on
// object LITERALS already rejects at compile time if a stray field like `comment`
// were added. That compile-time protection does NOT apply once a caller builds the
// details object in a variable first — these tests prove recordUsageEvent itself is
// the enforcement point (now: what it puts on the wire), not just today's caller
// discipline, by deliberately bypassing the type system the way a variable-built
// details object would. Rewritten for E13-S020: the assertion target is now the
// captured request body (fake API), not a sessionStorage entry — the same claim
// (no stray field survives), a different observation point.
describe("recordUsageEvent privacy-safe field allowlist (E13-S016, rewritten for E13-S020)", () => {
  it("never sends an unexpected field even when the caller's details object carries one", async () => {
    const contaminatedDetails = {
      answerState: "ANSWERED",
      citationCount: 2,
      latencyMs: 500,
      comment: "使用者的敏感留言原文，不該出現在 analytics store",
      answerContent: "回答的完整原文，同樣不該出現",
    } as unknown as { answerState: "ANSWERED"; citationCount: number; latencyMs: number };

    recordUsageEvent("rag_answer_outcome", "u1", contaminatedDetails);
    await flushRecordUsageEvent();

    const [persisted] = getRecordedUsageEvents();
    if (!persisted) throw new Error("expected a persisted event");
    // `id` is server-assigned (analytics.yaml UsageEventCreated), not part of what
    // the client sent — excluded from this "what did the client actually send"
    // allowlist check the same way it's excluded from the request body itself.
    const { id: _id, ...sent } = persisted;
    expect(Object.keys(sent).sort()).toEqual(["answerState", "citationCount", "latencyMs", "name", "occurredAt"].sort());
    expect(sent.answerState).toBe("ANSWERED");
    expect(sent.citationCount).toBe(2);
    expect(sent.latencyMs).toBe(500);
  });

  it("sends only name/occurredAt for events given no details at all — no stray keys from a previous call leak in", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    const [persisted] = getRecordedUsageEvents();
    if (!persisted) throw new Error("expected a persisted event");
    const { id: _id, ...sent } = persisted;
    expect(Object.keys(sent).sort()).toEqual(["name", "occurredAt"].sort());
  });
});

describe("listUsageEvents (deprecated, E13-S020)", () => {
  it("always returns an empty list — usage events no longer persist client-side", async () => {
    recordUsageEvent("conversation_message_sent", "u1");
    await flushRecordUsageEvent();

    // Even though the event above genuinely reached the fake API (proven by the
    // describe blocks above), listUsageEvents() has no local store left to read.
    expect(listUsageEvents()).toEqual([]);
  });
});
