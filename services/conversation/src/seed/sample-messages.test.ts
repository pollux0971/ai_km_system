import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { seedSampleConversations } from "./sample-conversations.js";
import { messageSandboxSeeders, seedSampleMessages } from "./sample-messages.js";
import { toOwnerKey } from "../repository/owner-scope.js";
import { listMessages } from "../repository/messages.repository.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
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
  `);
});

afterEach(() => db.close());

const OWNER = toOwnerKey("owner-1");

describe("seedSampleMessages (E04-S042 dev seed)", () => {
  it("adds exactly 1 user + 1 assistant message per already-seeded sample conversation", () => {
    seedSampleConversations(db, OWNER);
    seedSampleMessages(db, OWNER);

    const conversations = db.prepare("select id from conversations where owner_key = ?").all(OWNER) as {
      id: string;
    }[];
    expect(conversations).toHaveLength(3);

    for (const { id } of conversations) {
      const messages = listMessages(db, OWNER, id);
      expect(messages).toHaveLength(2);
      expect(messages.map((m) => m.role).sort()).toEqual(["assistant", "user"]);
    }
  });

  it("the assistant message's content matches the conversation's lastMessagePreview verbatim", () => {
    seedSampleConversations(db, OWNER);
    seedSampleMessages(db, OWNER);

    const row = db
      .prepare("select id, last_message_preview as preview from conversations where title = ?")
      .get("產品保固政策詢問") as { id: string; preview: string };
    const messages = listMessages(db, OWNER, row.id);
    const assistant = messages.find((m) => m.role === "assistant");
    expect(assistant?.content).toBe(row.preview);
  });

  it("is idempotent for the same owner", () => {
    seedSampleConversations(db, OWNER);
    seedSampleMessages(db, OWNER);
    seedSampleMessages(db, OWNER);

    const conversations = db.prepare("select id from conversations where owner_key = ?").all(OWNER) as {
      id: string;
    }[];
    for (const { id } of conversations) {
      expect(listMessages(db, OWNER, id)).toHaveLength(2);
    }
  });

  it("does nothing (no throw) for a conversation that was never seeded", () => {
    expect(() => seedSampleMessages(db, OWNER)).not.toThrow();
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
  });

  it("keeps two owners' seeded messages fully separate", () => {
    const other = toOwnerKey("owner-2");
    seedSampleConversations(db, OWNER);
    seedSampleConversations(db, other);
    seedSampleMessages(db, OWNER);
    seedSampleMessages(db, other);

    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 12 });
  });
});

describe("messageSandboxSeeders (registry placeholder for E02-S032)", () => {
  it("exposes this seeder under a stable name, distinct from the conversations seeder", () => {
    expect(messageSandboxSeeders.map((s) => s.name)).toEqual(["sample-messages"]);
  });
});
