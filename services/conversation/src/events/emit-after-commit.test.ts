import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { ChangeEventBus } from "./change-event-bus.js";
import { appendChangeEvent } from "../repository/change-events.repository.js";
import { createConversation } from "../repository/conversations.repository.js";
import { toOwnerKey } from "../repository/owner-scope.js";

/**
 * E04-S044 AC8 regression: a subscriber must never see an event for a write
 * that rolled back. This isn't tested by mocking `publish` — it demonstrates
 * the actual structural guarantee every route file relies on: `bus.publish
 * (...)` is only ever reached AFTER `db.transaction(() => {...})()` has
 * already returned successfully. If the transaction throws, that line is
 * unreachable — not "usually skipped", literally never executed.
 */
let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table conversations (
      id text primary key, owner_key text not null, title text not null, mode text not null,
      knowledge_scopes text not null default '[]', model text not null, archived integer not null default 0,
      last_message_at text not null, last_message_preview text not null, created_at text not null, updated_at text not null
    );
    create table change_events (
      id integer primary key autoincrement, owner_key text not null, seq integer not null, type text not null,
      conversation_id text not null, message_id text, origin_client_id text, occurred_at text not null
    );
    create unique index uq_change_events_owner_seq on change_events (owner_key, seq);
  `);
});

afterEach(() => db.close());

const OWNER = toOwnerKey("owner-1");
const AT = "2026-08-28T05:00:00.000Z";

describe("emit-after-commit (AC8 fault injection)", () => {
  it("a subscriber receives nothing when the write's transaction rolls back", () => {
    const bus = new ChangeEventBus();
    const received: unknown[] = [];
    bus.subscribe(OWNER, (event) => received.push(event));

    // Mirrors the exact shape every route uses: db.transaction(...)() first,
    // bus.publish(...) only after it returns. Forcing the transaction to
    // throw (an unknown change-event type, same trick E04-S040/S042 tests
    // already use) proves publish() is never reached — not mocked away.
    expect(() => {
      const event = db.transaction(() => {
        const row = createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
        return appendChangeEvent(db, OWNER, {
          // @ts-expect-error deliberately invalid — forces the real runtime
          // validation in appendChangeEvent to throw mid-transaction.
          type: "conversation.exploded",
          conversationId: row.id,
          occurredAt: AT,
        });
      })();
      bus.publish(OWNER, event);
    }).toThrow();

    expect(received).toEqual([]);
    expect(db.prepare("select count(*) as n from conversations").get()).toEqual({ n: 0 });
    expect(db.prepare("select count(*) as n from change_events").get()).toEqual({ n: 0 });
  });

  it("a subscriber DOES receive the event when the same transaction succeeds (sanity control)", () => {
    const bus = new ChangeEventBus();
    const received: unknown[] = [];
    bus.subscribe(OWNER, (event) => received.push(event));

    const event = db.transaction(() => {
      const row = createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
      return appendChangeEvent(db, OWNER, {
        type: "conversation.created",
        conversationId: row.id,
        occurredAt: AT,
      });
    })();
    bus.publish(OWNER, event);

    expect(received).toEqual([event]);
  });
});
