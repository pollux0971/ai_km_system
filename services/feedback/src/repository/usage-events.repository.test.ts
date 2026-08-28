import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { computeLatencyMetrics, computeUsageMetrics, insertUsageEvent } from "./usage-events.repository.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    create table usage_events (
      id text primary key,
      owner_key text not null,
      user_id text not null,
      name text not null,
      conversation_id text,
      answer_state text,
      citation_count integer,
      latency_ms integer,
      occurred_at text not null,
      received_at text not null
    );
  `);
});

afterEach(() => db.close());

describe("insertUsageEvent (E13-S019 AC1)", () => {
  it("persists a minimal conversation_created event", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    const row = db.prepare("SELECT * FROM usage_events WHERE id = 'evt-1'").get() as Record<string, unknown>;
    expect(row.owner_key).toBe("alice");
    expect(row.user_id).toBe("alice");
    expect(row.conversation_id).toBeNull();
  });

  it("persists optional fields when present (rag_answer_outcome shape)", () => {
    insertUsageEvent(db, {
      id: "evt-2",
      ownerKey: "alice:sbx:xyz",
      userId: "alice",
      name: "rag_answer_outcome",
      conversationId: "conv-1",
      answerState: "ANSWERED",
      citationCount: 2,
      latencyMs: 1450,
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    const row = db.prepare("SELECT * FROM usage_events WHERE id = 'evt-2'").get() as Record<string, unknown>;
    expect(row.owner_key).toBe("alice:sbx:xyz");
    expect(row.latency_ms).toBe(1450);
    expect(row.citation_count).toBe(2);
  });
});

describe("computeUsageMetrics (E13-S019 AC2)", () => {
  it("AC2: two different users active on the same day -> dailyActiveUsers 2", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    insertUsageEvent(db, {
      id: "evt-2",
      ownerKey: "bob",
      userId: "bob",
      name: "conversation_created",
      occurredAt: "2026-08-28T06:00:00.000Z",
      receivedAt: "2026-08-28T06:00:01.000Z",
    });

    const metrics = computeUsageMetrics(db, "2026-08-28");
    expect(metrics.dailyActiveUsers).toBe(2);
  });

  it("sandbox: same real user_id across two different owner_keys counts once, not twice", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice:sbx:aaa",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    insertUsageEvent(db, {
      id: "evt-2",
      ownerKey: "alice:sbx:bbb",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-28T06:00:00.000Z",
      receivedAt: "2026-08-28T06:00:01.000Z",
    });

    const metrics = computeUsageMetrics(db, "2026-08-28");
    expect(metrics.dailyActiveUsers).toBe(1);
  });

  it("a day with no events reports 0 dailyActiveUsers", () => {
    const metrics = computeUsageMetrics(db, "2026-08-28");
    expect(metrics.dailyActiveUsers).toBe(0);
  });

  it("excludes events from a different UTC calendar day", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-27T23:59:59.000Z",
      receivedAt: "2026-08-27T23:59:59.000Z",
    });
    expect(computeUsageMetrics(db, "2026-08-28").dailyActiveUsers).toBe(0);
  });

  it("AC2: questionsAsked counts conversation_message_sent events over the whole table, not scoped to `date`", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_message_sent",
      occurredAt: "2026-08-01T00:00:00.000Z",
      receivedAt: "2026-08-01T00:00:01.000Z",
    });
    insertUsageEvent(db, {
      id: "evt-2",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_message_sent",
      occurredAt: "2026-08-28T00:00:00.000Z",
      receivedAt: "2026-08-28T00:00:01.000Z",
    });
    insertUsageEvent(db, {
      id: "evt-3",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_created",
      occurredAt: "2026-08-28T00:00:00.000Z",
      receivedAt: "2026-08-28T00:00:01.000Z",
    });

    expect(computeUsageMetrics(db, "2026-08-28").questionsAsked).toBe(2);
    expect(computeUsageMetrics(db, "2026-01-01").questionsAsked).toBe(2);
  });
});

describe("computeLatencyMetrics (E13-S019 AC3)", () => {
  it("AC3: averages 100/200/300 to 200, sampleCount 3", () => {
    for (const [id, latencyMs] of [
      ["evt-1", 100],
      ["evt-2", 200],
      ["evt-3", 300],
    ] as const) {
      insertUsageEvent(db, {
        id,
        ownerKey: "alice",
        userId: "alice",
        name: "rag_answer_outcome",
        latencyMs,
        occurredAt: "2026-08-28T05:00:00.000Z",
        receivedAt: "2026-08-28T05:00:01.000Z",
      });
    }
    const metrics = computeLatencyMetrics(db, 7, "2026-08-28T12:00:00.000Z");
    expect(metrics.averageLatencyMs).toBe(200);
    expect(metrics.sampleCount).toBe(3);
  });

  it("AC3: zero samples reports null, never 0", () => {
    const metrics = computeLatencyMetrics(db, 7, "2026-08-28T12:00:00.000Z");
    expect(metrics.averageLatencyMs).toBeNull();
    expect(metrics.sampleCount).toBe(0);
  });

  it("excludes rag_answer_outcome events with no latencyMs", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "rag_answer_outcome",
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    const metrics = computeLatencyMetrics(db, 7, "2026-08-28T12:00:00.000Z");
    expect(metrics.sampleCount).toBe(0);
  });

  it("excludes events outside the trailing window", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "rag_answer_outcome",
      latencyMs: 999,
      occurredAt: "2026-08-01T00:00:00.000Z",
      receivedAt: "2026-08-01T00:00:01.000Z",
    });
    const metrics = computeLatencyMetrics(db, 7, "2026-08-28T12:00:00.000Z");
    expect(metrics.sampleCount).toBe(0);
  });

  it("excludes events from a different name (conversation_message_sent has no latency semantics here)", () => {
    insertUsageEvent(db, {
      id: "evt-1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_message_sent",
      latencyMs: 999,
      occurredAt: "2026-08-28T05:00:00.000Z",
      receivedAt: "2026-08-28T05:00:01.000Z",
    });
    const metrics = computeLatencyMetrics(db, 7, "2026-08-28T12:00:00.000Z");
    expect(metrics.sampleCount).toBe(0);
  });
});
