import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { conversationSandboxSeeders, seedSampleConversations } from "./sample-conversations.js";
import { toOwnerKey } from "../repository/owner-scope.js";
import { lookupConversation } from "../repository/conversations.repository.js";

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
  `);
});

afterEach(() => db.close());

const OWNER = toOwnerKey("owner-1");

describe("seedSampleConversations (AC11)", () => {
  it("inserts exactly the 3 apps/web sample conversations", () => {
    seedSampleConversations(db, OWNER);
    const rows = db.prepare("select title, mode, model from conversations order by title").all();
    expect(rows).toHaveLength(3);
    const titles = rows.map((r) => (r as { title: string }).title).sort();
    expect(titles).toEqual(["Q3 銷售報表彙整", "產品保固政策詢問", "設備 E-204 錯誤代碼排查"].sort());
  });

  it("matches apps/web's field-for-field content for the warranty sample", () => {
    seedSampleConversations(db, OWNER);
    const row = db
      .prepare("select * from conversations where title = ?")
      .get("產品保固政策詢問") as Record<string, unknown>;
    expect(row.last_message_preview).toBe("保固期從出貨日起算 12 個月，涵蓋原廠零件更換。");
    expect(row.mode).toBe("normal");
    expect(JSON.parse(row.knowledge_scopes as string)).toEqual(["company", "qna"]);
    expect(row.model).toBe("standard");
    expect(row.archived).toBe(0);
  });

  it("is idempotent for the same owner", () => {
    seedSampleConversations(db, OWNER);
    seedSampleConversations(db, OWNER);
    const count = db.prepare("select count(*) as n from conversations where owner_key = ?").get(OWNER) as {
      n: number;
    };
    expect(count.n).toBe(3);
  });

  it("derives the same ids for the same owner across calls", () => {
    seedSampleConversations(db, OWNER);
    const first = db
      .prepare("select id from conversations order by id")
      .all()
      .map((r) => (r as { id: string }).id);
    db.prepare("delete from conversations").run();
    seedSampleConversations(db, OWNER);
    const second = db
      .prepare("select id from conversations order by id")
      .all()
      .map((r) => (r as { id: string }).id);
    expect(second).toEqual(first);
  });

  it("gives a different owner different ids for its own copy of the 3 samples", () => {
    const other = toOwnerKey("owner-2");
    seedSampleConversations(db, OWNER);
    seedSampleConversations(db, other);
    expect(db.prepare("select count(*) as n from conversations").get()).toEqual({ n: 6 });
    const ownerIds = db
      .prepare("select id from conversations where owner_key = ?")
      .all(OWNER)
      .map((r) => (r as { id: string }).id);
    const otherIds = db
      .prepare("select id from conversations where owner_key = ?")
      .all(other)
      .map((r) => (r as { id: string }).id);
    expect(ownerIds.some((id) => otherIds.includes(id))).toBe(false);
  });

  it("produces conversations that lookupConversation can find for their owner", () => {
    seedSampleConversations(db, OWNER);
    const id = (db.prepare("select id from conversations limit 1").get() as { id: string }).id;
    expect(lookupConversation(db, OWNER, id).outcome).toBe("found");
  });
});

describe("conversationSandboxSeeders (registry placeholder for E02-S032)", () => {
  it("exposes this seeder under a stable name", () => {
    expect(conversationSandboxSeeders.map((s) => s.name)).toContain("sample-conversations");
  });

  it("running the registered seeder does the same thing as calling the function directly", () => {
    const entry = conversationSandboxSeeders.find((s) => s.name === "sample-conversations");
    expect(entry).toBeDefined();
    entry?.seed(db, OWNER);
    expect(db.prepare("select count(*) as n from conversations").get()).toEqual({ n: 3 });
  });
});
