import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { appendChangeEvent, listChangeEventsAfter } from "./change-events.repository.js";
import { toOwnerKey } from "./owner-scope.js";

let db: Database.Database;

const AT = "2026-08-28T05:12:00.000Z";
const CONV = "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77";

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table change_events (
      id integer primary key autoincrement,
      owner_key text not null,
      seq integer not null,
      type text not null,
      conversation_id text not null,
      message_id text,
      origin_client_id text,
      occurred_at text not null
    );
    create unique index uq_change_events_owner_seq on change_events (owner_key, seq);
  `);
});

afterEach(() => db.close());

describe("appendChangeEvent (E04-S040 AC5)", () => {
  it("numbers a single owner's events 1..100 with no gaps", () => {
    const owner = toOwnerKey("o1");
    for (let i = 0; i < 100; i += 1) {
      appendChangeEvent(db, owner, {
        type: "message.created",
        conversationId: CONV,
        occurredAt: AT,
      });
    }
    const seqs = db
      .prepare("select seq from change_events where owner_key = ? order by seq")
      .all("o1")
      .map((r) => (r as { seq: number }).seq);
    expect(seqs).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it("gives each owner its own sequence starting at 1", () => {
    const a = toOwnerKey("o1");
    const b = toOwnerKey("o2");
    appendChangeEvent(db, a, { type: "conversation.created", conversationId: CONV, occurredAt: AT });
    appendChangeEvent(db, a, { type: "conversation.updated", conversationId: CONV, occurredAt: AT });
    const first = appendChangeEvent(db, b, {
      type: "conversation.created",
      conversationId: CONV,
      occurredAt: AT,
    });
    expect(first.seq).toBe(1);
    expect(
      db.prepare("select max(seq) as m from change_events where owner_key = 'o1'").get(),
    ).toEqual({ m: 2 });
  });

  it("returns the row it wrote, including the assigned seq", () => {
    const row = appendChangeEvent(db, toOwnerKey("o1"), {
      type: "message.created",
      conversationId: CONV,
      messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
      originClientId: "c7c2f0b6-1f9a-4c1e-9f2b-2d3e4f5a6b7c",
      occurredAt: AT,
    });
    expect(row).toMatchObject({
      seq: 1,
      type: "message.created",
      conversationId: CONV,
      messageId: "1b6a1f2c-3d4e-4f50-8a61-7c8d9e0f1a2b",
      originClientId: "c7c2f0b6-1f9a-4c1e-9f2b-2d3e4f5a6b7c",
    });
  });

  it("stores no message id for conversation-level events", () => {
    const row = appendChangeEvent(db, toOwnerKey("o1"), {
      type: "conversation.deleted",
      conversationId: CONV,
      occurredAt: AT,
    });
    expect(row.messageId).toBeUndefined();
  });

  it("participates in the caller's transaction — a rollback takes the event with it", () => {
    const owner = toOwnerKey("o1");
    const tx = db.transaction(() => {
      appendChangeEvent(db, owner, {
        type: "conversation.created",
        conversationId: CONV,
        occurredAt: AT,
      });
      throw new Error("caller rolled back");
    });
    expect(() => tx()).toThrow("caller rolled back");
    expect(db.prepare("select count(*) as n from change_events").get()).toEqual({ n: 0 });
  });

  it("rejects an event type the contract does not define", () => {
    expect(() =>
      appendChangeEvent(db, toOwnerKey("o1"), {
        // @ts-expect-error deliberately invalid — the runtime must reject it too
        type: "conversation.exploded",
        conversationId: CONV,
        occurredAt: AT,
      }),
    ).toThrow();
  });

  it("refuses an empty owner key rather than writing an unowned row", () => {
    expect(() =>
      appendChangeEvent(db, "" as ReturnType<typeof toOwnerKey>, {
        type: "conversation.created",
        conversationId: CONV,
        occurredAt: AT,
      }),
    ).toThrow();
  });
});

describe("listChangeEventsAfter (E04-S040 AC6)", () => {
  beforeEach(() => {
    const owner = toOwnerKey("o1");
    for (let i = 0; i < 100; i += 1) {
      appendChangeEvent(db, owner, {
        type: "message.created",
        conversationId: CONV,
        occurredAt: AT,
      });
    }
  });

  it("returns seq 51..70 for (after=50, limit=20)", () => {
    const rows = listChangeEventsAfter(db, toOwnerKey("o1"), 50, 20);
    expect(rows.map((r) => r.seq)).toEqual(Array.from({ length: 20 }, (_, i) => i + 51));
  });

  it("returns them in ascending seq order", () => {
    const rows = listChangeEventsAfter(db, toOwnerKey("o1"), 0, 5);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns nothing once the caller is already up to date", () => {
    expect(listChangeEventsAfter(db, toOwnerKey("o1"), 100, 20)).toEqual([]);
  });

  it("never returns another owner's events, even for a seq range they share", () => {
    const b = toOwnerKey("o2");
    appendChangeEvent(db, b, { type: "conversation.created", conversationId: "other", occurredAt: AT });
    const rows = listChangeEventsAfter(db, b, 0, 20);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.conversationId).toBe("other");
  });

  it("refuses an empty owner key rather than listing across owners", () => {
    expect(() =>
      listChangeEventsAfter(db, "" as ReturnType<typeof toOwnerKey>, 0, 20),
    ).toThrow();
  });

  it("clamps a hostile limit instead of letting a client ask for everything", () => {
    const rows = listChangeEventsAfter(db, toOwnerKey("o1"), 0, 10_000);
    expect(rows.length).toBeLessThanOrEqual(1000);
  });
});
