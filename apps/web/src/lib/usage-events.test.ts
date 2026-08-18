import { beforeEach, describe, expect, it, vi } from "vitest";
import { listUsageEvents, recordUsageEvent } from "./usage-events";

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
