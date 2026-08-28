import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { adminGetMessage, adminListMessagesWithFeedback } from "./admin-read.repository.js";

let db: Database.Database;

function insertMessage(row: {
  id: string;
  conversationId: string;
  ownerKey: string;
  content: string;
  feedback?: "OK" | "NG";
  feedbackReason?: string;
  feedbackComment?: string;
  citationFeedback?: Record<string, "OK" | "NG">;
  updatedAt: string;
}): void {
  db.prepare(
    `INSERT INTO messages
       (id, conversation_id, owner_key, role, content, attachment_names, feedback, feedback_reason, feedback_comment, citation_feedback, created_at, updated_at)
     VALUES (@id, @conversation_id, @owner_key, 'assistant', @content, '[]', @feedback, @feedback_reason, @feedback_comment, @citation_feedback, @updated_at, @updated_at)`,
  ).run({
    id: row.id,
    conversation_id: row.conversationId,
    owner_key: row.ownerKey,
    content: row.content,
    feedback: row.feedback ?? null,
    feedback_reason: row.feedbackReason ?? null,
    feedback_comment: row.feedbackComment ?? null,
    citation_feedback: row.citationFeedback ? JSON.stringify(row.citationFeedback) : null,
    updated_at: row.updatedAt,
  });
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    create table conversations (id text primary key, owner_key text not null);
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
  db.prepare(`INSERT INTO conversations (id, owner_key) VALUES ('conv-a', 'alice'), ('conv-b', 'bob')`).run();
});

afterEach(() => db.close());

describe("adminListMessagesWithFeedback (E13-S019)", () => {
  it("AC4: lists feedback from MULTIPLE owners — the whole point of an admin queue", () => {
    insertMessage({
      id: "msg-1",
      conversationId: "conv-a",
      ownerKey: "alice",
      content: "alice's answer",
      feedback: "NG",
      updatedAt: "2026-08-28T01:00:00.000Z",
    });
    insertMessage({
      id: "msg-2",
      conversationId: "conv-b",
      ownerKey: "bob",
      content: "bob's answer",
      feedback: "OK",
      updatedAt: "2026-08-28T02:00:00.000Z",
    });

    const page = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20 });
    expect(page.totalCount).toBe(2);
    expect(page.items.map((i) => i.messageId).sort()).toEqual(["msg-1", "msg-2"]);
  });

  it("excludes messages with no feedback at all", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-a", ownerKey: "alice", content: "x", updatedAt: "t" });
    const page = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20 });
    expect(page.totalCount).toBe(0);
  });

  it("AC4: verdict filter — ok/ng maps to the DB's uppercase OK/NG", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-a", ownerKey: "alice", content: "x", feedback: "OK", updatedAt: "t1" });
    insertMessage({ id: "msg-2", conversationId: "conv-a", ownerKey: "alice", content: "y", feedback: "NG", updatedAt: "t2" });

    const okPage = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20, verdict: "ok" });
    expect(okPage.items.map((i) => i.messageId)).toEqual(["msg-1"]);
    expect(okPage.items[0]!.verdict).toBe("ok");

    const ngPage = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20, verdict: "ng" });
    expect(ngPage.items.map((i) => i.messageId)).toEqual(["msg-2"]);
  });

  it("AC4: hasReason=true returns only items with a reason", () => {
    insertMessage({
      id: "msg-1",
      conversationId: "conv-a",
      ownerKey: "alice",
      content: "x",
      feedback: "NG",
      feedbackReason: "INCOMPLETE",
      updatedAt: "t1",
    });
    insertMessage({ id: "msg-2", conversationId: "conv-a", ownerKey: "alice", content: "y", feedback: "NG", updatedAt: "t2" });

    const page = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20, hasReason: true });
    expect(page.items.map((i) => i.messageId)).toEqual(["msg-1"]);
  });

  it("orders newest-submitted (updated_at) first", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-a", ownerKey: "alice", content: "x", feedback: "OK", updatedAt: "2026-08-28T01:00:00.000Z" });
    insertMessage({ id: "msg-2", conversationId: "conv-a", ownerKey: "alice", content: "y", feedback: "OK", updatedAt: "2026-08-28T03:00:00.000Z" });

    const page = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20 });
    expect(page.items.map((i) => i.messageId)).toEqual(["msg-2", "msg-1"]);
  });

  it("paginates: page 2 of pageSize 1 returns the second item, totalPages reflects the filtered set", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-a", ownerKey: "alice", content: "x", feedback: "OK", updatedAt: "t1" });
    insertMessage({ id: "msg-2", conversationId: "conv-a", ownerKey: "alice", content: "y", feedback: "OK", updatedAt: "t2" });

    const page = adminListMessagesWithFeedback(db, { page: 2, pageSize: 1 });
    expect(page.items).toHaveLength(1);
    expect(page.totalCount).toBe(2);
    expect(page.totalPages).toBe(2);
  });

  it("answerExcerpt is truncated to 200 characters and citationFeedback is a stable-ordered array", () => {
    insertMessage({
      id: "msg-1",
      conversationId: "conv-a",
      ownerKey: "alice",
      content: "a".repeat(300),
      feedback: "OK",
      citationFeedback: { "10": "OK", "2": "NG", "1": "OK" },
      updatedAt: "t1",
    });

    const page = adminListMessagesWithFeedback(db, { page: 1, pageSize: 20 });
    const item = page.items[0]!;
    expect(item.answerExcerpt).toHaveLength(200);
    expect(item.citationFeedback).toEqual([
      { citationId: "1", verdict: "ok" },
      { citationId: "2", verdict: "ng" },
      { citationId: "10", verdict: "ok" },
    ]);
  });
});

describe("adminGetMessage (E13-S019)", () => {
  it("AC5: returns the feedback item for a message that has feedback, regardless of owner", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-b", ownerKey: "bob", content: "answer", feedback: "NG", feedbackComment: "少了保固細節。", updatedAt: "t1" });
    const item = adminGetMessage(db, "msg-1");
    expect(item?.messageId).toBe("msg-1");
    expect(item?.comment).toBe("少了保固細節。");
  });

  it("AC5: undefined for a message with no feedback yet (route maps this to 404)", () => {
    insertMessage({ id: "msg-1", conversationId: "conv-a", ownerKey: "alice", content: "x", updatedAt: "t1" });
    expect(adminGetMessage(db, "msg-1")).toBeUndefined();
  });

  it("AC5: undefined for a message id that does not exist at all", () => {
    expect(adminGetMessage(db, "nonexistent")).toBeUndefined();
  });
});
