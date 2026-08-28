import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp, TEST_ROLES_HEADER, TEST_USER_HEADER } from "../testing/build-test-app.js";
import { expectResponseMatchesContract, loadAnalyticsContract } from "../testing/contract-check.js";

let app: FastifyInstance | undefined;
let db: Database.Database | undefined;

afterEach(async () => {
  await app?.close();
  db?.close();
  app = undefined;
  db = undefined;
});

async function build(): Promise<{ app: FastifyInstance; db: Database.Database }> {
  const built = await buildTestApp();
  app = built.app;
  db = built.db;
  return built;
}

const AUDITOR_HEADERS = { [TEST_USER_HEADER]: "demo-auditor", [TEST_ROLES_HEADER]: "auditor" };
const GENERAL_USER_HEADERS = { [TEST_USER_HEADER]: "demo-user", [TEST_ROLES_HEADER]: "general_user" };

function insertConversation(db: Database.Database, id: string, ownerKey: string): void {
  db.prepare(
    `INSERT INTO conversations (id, owner_key, title, mode, model, last_message_at, last_message_preview, created_at, updated_at)
     VALUES (@id, @owner_key, 'x', 'normal', 'standard', @now, 'x', @now, @now)`,
  ).run({ id, owner_key: ownerKey, now: "2026-08-28T00:00:00.000Z" });
}

function insertFeedbackMessage(
  db: Database.Database,
  row: {
    id: string;
    conversationId: string;
    ownerKey: string;
    content: string;
    feedback?: "OK" | "NG";
    feedbackReason?: string;
    feedbackComment?: string;
    updatedAt: string;
  },
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, owner_key, role, content, feedback, feedback_reason, feedback_comment, created_at, updated_at)
     VALUES (@id, @conversation_id, @owner_key, 'assistant', @content, @feedback, @feedback_reason, @feedback_comment, @updated_at, @updated_at)`,
  ).run({
    id: row.id,
    conversation_id: row.conversationId,
    owner_key: row.ownerKey,
    content: row.content,
    feedback: row.feedback ?? null,
    feedback_reason: row.feedbackReason ?? null,
    feedback_comment: row.feedbackComment ?? null,
    updated_at: row.updatedAt,
  });
}

describe("GET /v1/admin/feedback (E13-S019 AC4)", () => {
  it("AC4: demo-auditor sees feedback from MULTIPLE owners (alice AND bob), the whole point of the queue", async () => {
    const { db } = await build();
    insertConversation(db, "11111111-1111-1111-1111-111111111111", "alice");
    insertConversation(db, "22222222-2222-2222-2222-222222222222", "bob");
    insertFeedbackMessage(db, {
      id: "33333333-3333-3333-3333-333333333333",
      conversationId: "11111111-1111-1111-1111-111111111111",
      ownerKey: "alice",
      content: "alice's answer",
      feedback: "NG",
      updatedAt: "2026-08-28T01:00:00.000Z",
    });
    insertFeedbackMessage(db, {
      id: "44444444-4444-4444-4444-444444444444",
      conversationId: "22222222-2222-2222-2222-222222222222",
      ownerKey: "bob",
      content: "bob's answer",
      feedback: "OK",
      updatedAt: "2026-08-28T02:00:00.000Z",
    });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCount).toBe(2);
    expect(body.items.map((i: { messageId: string }) => i.messageId).sort()).toEqual(["33333333-3333-3333-3333-333333333333", "44444444-4444-4444-4444-444444444444"]);

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/feedback", "get", 200, body);
  });

  it("AC4: verdict=ok filters correctly", async () => {
    const { db } = await build();
    insertConversation(db, "11111111-1111-1111-1111-111111111111", "alice");
    insertFeedbackMessage(db, { id: "55555555-5555-5555-5555-555555555555", conversationId: "11111111-1111-1111-1111-111111111111", ownerKey: "alice", content: "x", feedback: "OK", updatedAt: "t1" });
    insertFeedbackMessage(db, { id: "66666666-6666-6666-6666-666666666666", conversationId: "11111111-1111-1111-1111-111111111111", ownerKey: "alice", content: "y", feedback: "NG", updatedAt: "t2" });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback?verdict=ok", headers: AUDITOR_HEADERS });
    const body = res.json();
    expect(body.items.map((i: { messageId: string }) => i.messageId)).toEqual(["55555555-5555-5555-5555-555555555555"]);
  });

  it("AC4: hasReason=true returns only items with a reason", async () => {
    const { db } = await build();
    insertConversation(db, "11111111-1111-1111-1111-111111111111", "alice");
    insertFeedbackMessage(db, {
      id: "55555555-5555-5555-5555-555555555555",
      conversationId: "11111111-1111-1111-1111-111111111111",
      ownerKey: "alice",
      content: "x",
      feedback: "NG",
      feedbackReason: "INCOMPLETE",
      updatedAt: "t1",
    });
    insertFeedbackMessage(db, { id: "66666666-6666-6666-6666-666666666666", conversationId: "11111111-1111-1111-1111-111111111111", ownerKey: "alice", content: "y", feedback: "NG", updatedAt: "t2" });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback?hasReason=true", headers: AUDITOR_HEADERS });
    const body = res.json();
    expect(body.items.map((i: { messageId: string }) => i.messageId)).toEqual(["55555555-5555-5555-5555-555555555555"]);
  });

  it("AC4: demo-user (general_user) is 403", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback", headers: GENERAL_USER_HEADERS });
    expect(res.statusCode).toBe(403);

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/feedback", "get", 403, res.json());
  });

  it("Security AC: unauthenticated is 401", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback" });
    expect(res.statusCode).toBe(401);
  });

  it("Security AC (AC6): answerExcerpt is never the full answer, and no field carries full content", async () => {
    const { db } = await build();
    insertConversation(db, "11111111-1111-1111-1111-111111111111", "alice");
    const longContent = "機密內容".repeat(100);
    insertFeedbackMessage(db, { id: "55555555-5555-5555-5555-555555555555", conversationId: "11111111-1111-1111-1111-111111111111", ownerKey: "alice", content: longContent, feedback: "OK", updatedAt: "t1" });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback", headers: AUDITOR_HEADERS });
    const item = res.json().items[0];
    expect(item.answerExcerpt.length).toBeLessThanOrEqual(200);
    expect(JSON.stringify(item)).not.toContain(longContent);
  });
});

describe("GET /v1/admin/feedback/:messageId (E13-S019 AC5)", () => {
  it("AC5: returns the FeedbackItem for a message with feedback", async () => {
    const { db } = await build();
    insertConversation(db, "22222222-2222-2222-2222-222222222222", "bob");
    insertFeedbackMessage(db, {
      id: "55555555-5555-5555-5555-555555555555",
      conversationId: "22222222-2222-2222-2222-222222222222",
      ownerKey: "bob",
      content: "answer",
      feedback: "NG",
      feedbackComment: "少了保固細節。",
      updatedAt: "2026-08-28T05:15:00.000Z",
    });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback/55555555-5555-5555-5555-555555555555", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messageId).toBe("55555555-5555-5555-5555-555555555555");
    expect(body.comment).toBe("少了保固細節。");

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/feedback/{messageId}", "get", 200, body);
  });

  it("AC5: 404 for a message with no feedback yet", async () => {
    const { db } = await build();
    insertConversation(db, "11111111-1111-1111-1111-111111111111", "alice");
    insertFeedbackMessage(db, { id: "55555555-5555-5555-5555-555555555555", conversationId: "11111111-1111-1111-1111-111111111111", ownerKey: "alice", content: "x", updatedAt: "t1" });

    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback/55555555-5555-5555-5555-555555555555", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(404);

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/feedback/{messageId}", "get", 404, res.json());
  });

  it("AC5: 404 for a message id that does not exist at all", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback/nonexistent", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(404);
  });

  it("Security AC: unauthenticated is 401", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback/55555555-5555-5555-5555-555555555555" });
    expect(res.statusCode).toBe(401);
  });

  it("Security AC: general_user is 403", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/feedback/55555555-5555-5555-5555-555555555555", headers: GENERAL_USER_HEADERS });
    expect(res.statusCode).toBe(403);
  });
});
