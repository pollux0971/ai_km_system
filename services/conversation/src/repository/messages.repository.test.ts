import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  createMessage,
  createRevision,
  getMessage,
  listMessages,
  touchConversationSummary,
} from "./messages.repository.js";
import { appendChangeEvent } from "./change-events.repository.js";
import { toOwnerKey } from "./owner-scope.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table conversations (
      id text primary key,
      owner_key text not null,
      title text not null,
      mode text not null,
      knowledge_scopes text not null default '[]',
      model text not null,
      archived integer not null default 0,
      last_message_at text not null,
      last_message_preview text not null,
      created_at text not null,
      updated_at text not null
    );
    create table messages (
      id text primary key,
      conversation_id text not null references conversations(id) on delete cascade,
      owner_key text not null,
      role text not null,
      content text not null,
      attachment_names text not null default '[]',
      state text,
      revisions text,
      feedback text,
      feedback_reason text,
      feedback_comment text,
      citation_feedback text,
      created_at text not null,
      updated_at text not null
    );
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

const OWNER = toOwnerKey("owner-1");
const OTHER_OWNER = toOwnerKey("owner-2");
const AT = "2026-08-28T05:00:00.000Z";
const CONV = "c1";

function insertConversation(id: string, owner: string, now: string) {
  db.prepare(
    `insert into conversations
       (id, owner_key, title, mode, knowledge_scopes, model, archived, last_message_at, last_message_preview, created_at, updated_at)
     values (?, ?, '新對話', 'normal', '[]', 'standard', 0, ?, '尚無訊息。', ?, ?)`,
  ).run(id, owner, now, now, now);
}

describe("createMessage (AC1, AC2, AC3, AC4)", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("persists a user message with contract-shaped fields", () => {
    const row = createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "user",
      content: "hi",
      attachmentNames: [],
      now: AT,
    });
    expect(row).toMatchObject({
      id: "m1",
      conversationId: CONV,
      role: "user",
      content: "hi",
      attachmentNames: [],
      createdAt: AT,
    });
    expect(row.state).toBeUndefined();
    expect(row.revisions).toBeUndefined();
  });

  it("persists an assistant message with a state", () => {
    const row = createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "assistant",
      content: "answer",
      attachmentNames: [],
      state: "NO_EVIDENCE",
      now: AT,
    });
    expect(row.state).toBe("NO_EVIDENCE");
  });

  it("stores attachmentNames as a real array round-trip", () => {
    const row = createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "user",
      content: "",
      attachmentNames: ["a.pdf", "b.png"],
      now: AT,
    });
    expect(row.attachmentNames).toEqual(["a.pdf", "b.png"]);
  });

  it("refuses to write for an empty owner key", () => {
    expect(() =>
      createMessage(db, "" as ReturnType<typeof toOwnerKey>, CONV, {
        id: "m1",
        role: "user",
        content: "hi",
        attachmentNames: [],
        now: AT,
      }),
    ).toThrow();
  });
});

describe("touchConversationSummary", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("updates lastMessageAt/lastMessagePreview/updatedAt", () => {
    touchConversationSummary(db, OWNER, CONV, "hi", "2026-08-28T06:00:00.000Z");
    const row = db.prepare("select * from conversations where id = ?").get(CONV) as Record<
      string,
      unknown
    >;
    expect(row.last_message_preview).toBe("hi");
    expect(row.last_message_at).toBe("2026-08-28T06:00:00.000Z");
    expect(row.updated_at).toBe("2026-08-28T06:00:00.000Z");
  });

  it("is scoped — cannot touch another owner's conversation", () => {
    touchConversationSummary(db, OTHER_OWNER, CONV, "hijacked", "2026-08-28T06:00:00.000Z");
    const row = db.prepare("select last_message_preview as p from conversations where id = ?").get(CONV);
    expect(row).toEqual({ p: "尚無訊息。" });
  });
});

describe("listMessages (AC1)", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("returns [] for a conversation with no messages", () => {
    expect(listMessages(db, OWNER, CONV)).toEqual([]);
  });

  it("returns messages oldest first", () => {
    createMessage(db, OWNER, CONV, {
      id: "m2",
      role: "user",
      content: "second",
      attachmentNames: [],
      now: "2026-08-28T06:00:00.000Z",
    });
    createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "user",
      content: "first",
      attachmentNames: [],
      now: "2026-08-28T05:00:00.000Z",
    });
    const rows = listMessages(db, OWNER, CONV);
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2"]);
  });

  it("never returns another owner's messages even for the same conversation id", () => {
    createMessage(db, OWNER, CONV, { id: "m1", role: "user", content: "x", attachmentNames: [], now: AT });
    expect(listMessages(db, OTHER_OWNER, CONV)).toEqual([]);
  });
});

describe("getMessage (used by the revisions endpoint's 404 check)", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("finds a message that belongs to the given conversation and owner", () => {
    createMessage(db, OWNER, CONV, { id: "m1", role: "assistant", content: "x", attachmentNames: [], now: AT });
    expect(getMessage(db, OWNER, CONV, "m1")?.id).toBe("m1");
  });

  it("returns undefined for a message that belongs to a different conversation", () => {
    insertConversation("c2", OWNER, AT);
    createMessage(db, OWNER, "c2", { id: "m1", role: "assistant", content: "x", attachmentNames: [], now: AT });
    expect(getMessage(db, OWNER, CONV, "m1")).toBeUndefined();
  });

  it("returns undefined for another owner's message", () => {
    createMessage(db, OWNER, CONV, { id: "m1", role: "assistant", content: "x", attachmentNames: [], now: AT });
    expect(getMessage(db, OTHER_OWNER, CONV, "m1")).toBeUndefined();
  });
});

describe("createRevision (AC5)", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("pushes the old content onto revisions, oldest first, and replaces content", () => {
    createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "assistant",
      content: "v1",
      attachmentNames: [],
      state: "ANSWERED",
      now: AT,
    });
    const r1 = createRevision(db, OWNER, "m1", "v2", undefined, "2026-08-28T06:00:00.000Z");
    expect(r1.content).toBe("v2");
    expect(r1.revisions).toEqual(["v1"]);

    const r2 = createRevision(db, OWNER, "m1", "v3", "PARTIAL", "2026-08-28T07:00:00.000Z");
    expect(r2.content).toBe("v3");
    expect(r2.revisions).toEqual(["v1", "v2"]);
    expect(r2.state).toBe("PARTIAL");
  });

  it("leaves state unchanged when not supplied", () => {
    createMessage(db, OWNER, CONV, {
      id: "m1",
      role: "assistant",
      content: "v1",
      attachmentNames: [],
      state: "ANSWERED",
      now: AT,
    });
    const revised = createRevision(db, OWNER, "m1", "v2", undefined, AT);
    expect(revised.state).toBe("ANSWERED");
  });
});

describe("atomicity (AC6 regression — event write failure must not leave an orphan message)", () => {
  beforeEach(() => insertConversation(CONV, OWNER, AT));

  it("rolls back the message insert and the conversation touch when the change-event write fails", () => {
    const tx = db.transaction(() => {
      createMessage(db, OWNER, CONV, {
        id: "m1",
        role: "user",
        content: "hi",
        attachmentNames: [],
        now: AT,
      });
      touchConversationSummary(db, OWNER, CONV, "hi", AT);
      appendChangeEvent(db, OWNER, {
        // @ts-expect-error deliberately invalid — forces the real runtime
        // validation in appendChangeEvent to throw mid-transaction.
        type: "message.exploded",
        conversationId: CONV,
        messageId: "m1",
        occurredAt: AT,
      });
    });

    expect(() => tx()).toThrow();
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
    expect(
      db.prepare("select last_message_preview as p from conversations where id = ?").get(CONV),
    ).toEqual({ p: "尚無訊息。" });
  });
});
