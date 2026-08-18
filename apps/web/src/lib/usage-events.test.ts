import { beforeEach, describe, expect, it, vi } from "vitest";
import { countDistinctCitations, listUsageEvents, recordUsageEvent } from "./usage-events";

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
