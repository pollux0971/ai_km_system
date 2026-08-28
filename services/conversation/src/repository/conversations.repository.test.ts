import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  createConversation,
  deleteConversation,
  listConversations,
  lookupConversation,
  updateConversation,
} from "./conversations.repository.js";
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
      owner_key text not null
    );
  `);
});

afterEach(() => db.close());

const OWNER = toOwnerKey("owner-1");
const OTHER_OWNER = toOwnerKey("owner-2");
const AT = "2026-08-28T05:00:00.000Z";

describe("createConversation (AC5)", () => {
  it("applies the contract defaults", () => {
    const row = createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    expect(row).toMatchObject({
      id: "c1",
      title: "新對話",
      lastMessagePreview: "尚無訊息。",
      model: "standard",
      archived: false,
      mode: "normal",
      knowledgeScopes: [],
      lastMessageAt: AT,
      createdAt: AT,
      updatedAt: AT,
    });
  });

  it("refuses to create a row for an empty owner key", () => {
    expect(() =>
      createConversation(db, "" as ReturnType<typeof toOwnerKey>, { id: "c1", mode: "normal", now: AT }),
    ).toThrow();
  });
});

describe("lookupConversation (AC9 — 403 vs 404)", () => {
  it("is not_found for an id that never existed", () => {
    expect(lookupConversation(db, OWNER, "missing").outcome).toBe("not_found");
  });

  it("is forbidden for an id owned by somebody else", () => {
    createConversation(db, OTHER_OWNER, { id: "c1", mode: "normal", now: AT });
    expect(lookupConversation(db, OWNER, "c1").outcome).toBe("forbidden");
  });

  it("is found (and returns the row) for the owner's own conversation", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    const result = lookupConversation(db, OWNER, "c1");
    expect(result.outcome).toBe("found");
    if (result.outcome === "found") expect(result.row.id).toBe("c1");
  });
});

describe("listConversations (AC1-AC4)", () => {
  it("returns an empty page with totalPages 1 when the owner has nothing", () => {
    const page = listConversations(db, OWNER, { page: 1, pageSize: 20, archived: false });
    expect(page).toEqual({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
  });

  it("paginates: pageSize 2, page 2 of 3 items returns 1 item and totalPages 2", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: "2026-08-01T00:00:00.000Z" });
    createConversation(db, OWNER, { id: "c2", mode: "normal", now: "2026-08-02T00:00:00.000Z" });
    createConversation(db, OWNER, { id: "c3", mode: "normal", now: "2026-08-03T00:00:00.000Z" });

    const page = listConversations(db, OWNER, { page: 2, pageSize: 2, archived: false });
    expect(page.items).toHaveLength(1);
    expect(page.totalPages).toBe(2);
    expect(page.totalCount).toBe(3);
    // sorted by lastMessageAt desc: c3, c2, c1 -> page2 = [c1]
    expect(page.items[0]?.id).toBe("c1");
  });

  it("clamps an out-of-range page to empty items without erroring", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    const page = listConversations(db, OWNER, { page: 99, pageSize: 20, archived: false });
    expect(page.items).toEqual([]);
    expect(page.totalCount).toBe(1);
  });

  it("filters by case-insensitive title substring", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c1", { title: "Q3 銷售報表" }, AT);
    createConversation(db, OWNER, { id: "c2", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c2", { title: "保固政策" }, AT);

    const page = listConversations(db, OWNER, { page: 1, pageSize: 20, q: "銷售", archived: false });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe("c1");
    expect(page.totalCount).toBe(1);
  });

  it("treats whitespace-only q as no search", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    const page = listConversations(db, OWNER, { page: 1, pageSize: 20, q: "   ", archived: false });
    expect(page.totalCount).toBe(1);
  });

  it("archived is a switch, not an also-include toggle", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    createConversation(db, OWNER, { id: "c2", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c2", { archived: true }, AT);

    const active = listConversations(db, OWNER, { page: 1, pageSize: 20, archived: false });
    expect(active.items.map((i) => i.id)).toEqual(["c1"]);

    const archived = listConversations(db, OWNER, { page: 1, pageSize: 20, archived: true });
    expect(archived.items.map((i) => i.id)).toEqual(["c2"]);
  });

  it("never returns another owner's conversations", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    createConversation(db, OTHER_OWNER, { id: "c2", mode: "normal", now: AT });
    const page = listConversations(db, OWNER, { page: 1, pageSize: 20, archived: false });
    expect(page.items.map((i) => i.id)).toEqual(["c1"]);
  });

  it("regression: totalCount/totalPages reflect the filtered set, not the whole store", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c1", { title: "銷售報表" }, AT);
    createConversation(db, OWNER, { id: "c2", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c2", { title: "完全不相關" }, AT);

    const page = listConversations(db, OWNER, { page: 1, pageSize: 20, q: "銷售", archived: false });
    expect(page.totalCount).toBe(1);
    expect(page.totalPages).toBe(1);
  });
});

describe("updateConversation (AC6-AC7, AC10)", () => {
  it("updates only the supplied fields", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    const updated = updateConversation(db, OWNER, "c1", { archived: true }, "2026-08-28T06:00:00.000Z");
    expect(updated.archived).toBe(true);
    expect(updated.title).toBe("新對話");
    expect(updated.updatedAt).toBe("2026-08-28T06:00:00.000Z");
  });

  it("round-trips archived true then false", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    updateConversation(db, OWNER, "c1", { archived: true }, AT);
    const back = updateConversation(db, OWNER, "c1", { archived: false }, AT);
    expect(back.archived).toBe(false);
  });

  it("persists knowledgeScopes as an array round-trip", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    const updated = updateConversation(db, OWNER, "c1", { knowledgeScopes: ["company", "qna"] }, AT);
    expect(updated.knowledgeScopes).toEqual(["company", "qna"]);
  });
});

describe("deleteConversation (AC8)", () => {
  it("removes the conversation row", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    deleteConversation(db, OWNER, "c1");
    expect(lookupConversation(db, OWNER, "c1").outcome).toBe("not_found");
  });

  it("cascades to the conversation's messages", () => {
    createConversation(db, OWNER, { id: "c1", mode: "normal", now: AT });
    db.prepare("insert into messages (id, conversation_id, owner_key) values (?, ?, ?)").run(
      "m1",
      "c1",
      OWNER,
    );
    deleteConversation(db, OWNER, "c1");
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
  });

  it("is scoped — cannot delete another owner's row even if called with their id", () => {
    createConversation(db, OTHER_OWNER, { id: "c1", mode: "normal", now: AT });
    deleteConversation(db, OWNER, "c1");
    expect(lookupConversation(db, OTHER_OWNER, "c1").outcome).toBe("found");
  });
});
