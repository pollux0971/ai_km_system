import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeAverageLatencyMs,
  computeDAU,
  computeQuestionsAsked,
  countDistinctCitations,
  listUsageEvents,
  recordUsageEvent,
  type UsageEvent,
} from "./usage-events";

describe("recordUsageEvent / listUsageEvents (E13-S009)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("returns an empty list before any event has been recorded", () => {
    expect(listUsageEvents()).toEqual([]);
  });

  it("persists a recorded event with its name, userId, and an ISO timestamp", () => {
    recordUsageEvent("conversation_message_sent", "u1");

    const events = listUsageEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("expected an event");
    expect(event.name).toBe("conversation_message_sent");
    expect(event.userId).toBe("u1");
    expect(() => new Date(event.occurredAt).toISOString()).not.toThrow();
    expect(new Date(event.occurredAt).toISOString()).toBe(event.occurredAt);
  });

  it("accumulates multiple events in insertion order, oldest first", () => {
    recordUsageEvent("conversation_message_sent", "u1");
    recordUsageEvent("conversation_message_sent", "u2");
    recordUsageEvent("conversation_message_sent", "u1");

    const events = listUsageEvents();
    expect(events.map((event) => event.userId)).toEqual(["u1", "u2", "u1"]);
  });

  it("keeps each user's events distinct — recording for one user does not merge with or overwrite another user's events", () => {
    recordUsageEvent("conversation_message_sent", "alice");
    recordUsageEvent("conversation_message_sent", "bob");

    const events = listUsageEvents();
    expect(events.filter((event) => event.userId === "alice")).toHaveLength(1);
    expect(events.filter((event) => event.userId === "bob")).toHaveLength(1);
  });

  it("never throws even if the underlying store write fails (telemetry must not corrupt the caller's own flow)", () => {
    const setItemSpy = vi.spyOn(window.sessionStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => recordUsageEvent("conversation_message_sent", "u1")).not.toThrow();

    setItemSpy.mockRestore();
  });

  it("treats corrupted stored JSON as an empty list rather than throwing", () => {
    window.sessionStorage.setItem("ai-km:mock-usage-events", "not valid json");

    expect(listUsageEvents()).toEqual([]);
  });
});

describe("recordUsageEvent / listUsageEvents — conversation_created (E13-S010)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("accepts conversation_created as a distinct event name", () => {
    recordUsageEvent("conversation_created", "u1");

    const events = listUsageEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("expected an event");
    expect(event.name).toBe("conversation_created");
    expect(event.userId).toBe("u1");
  });

  it("keeps conversation_created and conversation_message_sent distinguishable when both are recorded for the same user", () => {
    recordUsageEvent("conversation_created", "u1");
    recordUsageEvent("conversation_message_sent", "u1");

    const events = listUsageEvents();
    expect(events.map((event) => event.name)).toEqual(["conversation_created", "conversation_message_sent"]);
  });
});

describe("recordUsageEvent / listUsageEvents — rag_answer_outcome (E13-S011)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("accepts rag_answer_outcome as a distinct event name, persisting its answerState and citationCount", () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 1 });

    const events = listUsageEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    if (!event) throw new Error("expected an event");
    expect(event.name).toBe("rag_answer_outcome");
    expect(event.userId).toBe("u1");
    expect(event.answerState).toBe("ANSWERED");
    expect(event.citationCount).toBe(1);
  });

  it("persists a non-ANSWERED state (e.g. NO_EVIDENCE) and a zero citationCount distinctly, not defaulted to ANSWERED/1", () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "NO_EVIDENCE", citationCount: 0 });

    const [event] = listUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.answerState).toBe("NO_EVIDENCE");
    expect(event.citationCount).toBe(0);
  });

  it("leaves answerState/citationCount undefined for events recorded without details (conversation_message_sent/conversation_created), not populated with stray values", () => {
    recordUsageEvent("conversation_message_sent", "u1");

    const [event] = listUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.answerState).toBeUndefined();
    expect(event.citationCount).toBeUndefined();
  });
});

describe("recordUsageEvent / listUsageEvents — latencyMs (E13-S013)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("persists latencyMs alongside answerState/citationCount on a rag_answer_outcome event", () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 1, latencyMs: 1234 });

    const [event] = listUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.latencyMs).toBe(1234);
  });

  it("persists a zero latencyMs distinctly, not treated as absent", () => {
    recordUsageEvent("rag_answer_outcome", "u1", { answerState: "ANSWERED", citationCount: 0, latencyMs: 0 });

    const [event] = listUsageEvents();
    if (!event) throw new Error("expected an event");
    expect(event.latencyMs).toBe(0);
  });

  it("leaves latencyMs undefined for events recorded without it, not defaulted to 0", () => {
    recordUsageEvent("conversation_message_sent", "u1");

    const [event] = listUsageEvents();
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

// E13-S016 privacy-safe analytics fields. All of E13-S001~S015's
// telemetry/analytics call sites were individually grepped clean of free
// text (see this story's EVIDENCE for the full field-by-field audit) —
// every current caller of recordUsageEvent passes only literal objects
// containing answerState/citationCount/latencyMs, which TypeScript's
// excess-property check on object LITERALS already rejects at compile
// time if a stray field like `comment` were added. That compile-time
// protection does NOT apply once a caller builds the details object in a
// variable first — these tests prove recordUsageEvent itself is the
// enforcement point, not just today's caller discipline, by deliberately
// bypassing the type system the way a variable-built details object
// would.
describe("recordUsageEvent privacy-safe field allowlist (E13-S016)", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("never persists an unexpected field even when the caller's details object carries one", () => {
    const contaminatedDetails = {
      answerState: "ANSWERED",
      citationCount: 2,
      latencyMs: 500,
      comment: "使用者的敏感留言原文，不該出現在 analytics store",
      answerContent: "回答的完整原文，同樣不該出現",
    } as unknown as { answerState: "ANSWERED"; citationCount: number; latencyMs: number };

    recordUsageEvent("rag_answer_outcome", "u1", contaminatedDetails);

    const raw = window.sessionStorage.getItem("ai-km:mock-usage-events");
    expect(raw).not.toBeNull();
    expect(raw).not.toContain("敏感留言原文");
    expect(raw).not.toContain("回答的完整原文");
    expect(raw).not.toContain("comment");
    expect(raw).not.toContain("answerContent");

    const [persisted] = listUsageEvents();
    if (!persisted) throw new Error("expected a persisted event");
    expect(Object.keys(persisted).sort()).toEqual(["answerState", "citationCount", "latencyMs", "name", "occurredAt", "userId"].sort());
    expect(persisted.answerState).toBe("ANSWERED");
    expect(persisted.citationCount).toBe(2);
    expect(persisted.latencyMs).toBe(500);
  });

  it("persists only name/userId/occurredAt for events given no details at all — no stray keys from a previous call leak in", () => {
    recordUsageEvent("conversation_message_sent", "u1");

    const [persisted] = listUsageEvents();
    if (!persisted) throw new Error("expected a persisted event");
    expect(Object.keys(persisted).sort()).toEqual(["name", "occurredAt", "userId"].sort());
  });
});
