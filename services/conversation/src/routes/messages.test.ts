import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp, TEST_USER_HEADER } from "../testing/build-test-app.js";
import { expectResponseMatchesContract, loadConversationsContract } from "../testing/contract-check.js";
import type { ContractCheckRegistry } from "../testing/contract-check.js";

let app: FastifyInstance | undefined;
let db: Database.Database | undefined;

async function build() {
  const built = await buildTestApp();
  app = built.app;
  db = built.db;
  return built;
}

afterEach(async () => {
  await app?.close();
  db?.close();
  app = undefined;
  db = undefined;
});

function authHeaders(userId: string, extra: Record<string, string> = {}) {
  return { [TEST_USER_HEADER]: userId, ...extra };
}

const registry: ContractCheckRegistry = await loadConversationsContract();

async function createConversation(app: FastifyInstance, userId: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/v1/conversations",
    headers: authHeaders(userId),
  });
  return res.json().id as string;
}

describe("GET /v1/conversations/:id/messages (AC1)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/conversations/anything/messages" });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "get",
      401,
      res.json(),
    );
  });

  it("AC1: [] for a conversation with no messages", async () => {
    const { app } = await build();
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "GET",
      url: `/v1/conversations/${id}/messages`,
      headers: authHeaders("alice"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("AC1: returns messages oldest first with a contract-conformant shape", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "first" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "second" },
    });

    const res = await app.inject({ method: "GET", url: `/v1/conversations/${id}/messages`, headers });
    const body = res.json();
    expect(body.map((m: { content: string }) => m.content)).toEqual(["first", "second"]);
    for (const message of body) {
      expectResponseMatchesContract(
        registry,
        "/conversations/{conversationId}/messages",
        "get",
        200,
        [message],
      );
    }
  });

  it("AC7: 403s for another owner's conversation", async () => {
    const { app } = await build();
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "GET",
      url: `/v1/conversations/${id}/messages`,
      headers: authHeaders("bob"),
    });
    expect(res.statusCode).toBe(403);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "get",
      403,
      res.json(),
    );
  });

  it("404s for a conversation that never existed", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "GET",
      url: "/v1/conversations/00000000-0000-0000-0000-000000000000/messages",
      headers: authHeaders("alice"),
    });
    expect(res.statusCode).toBe(404);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "get",
      404,
      res.json(),
    );
  });
});

describe("POST /v1/conversations/:id/messages (AC2, AC3, AC4, AC6, AC7, AC8)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/anything/messages",
      payload: { role: "user", content: "hi" },
    });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "post",
      401,
      res.json(),
    );
  });

  it("AC2: creates a user message and updates the conversation's preview/lastMessageAt", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");

    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.attachmentNames).toEqual([]);
    expect(body.state).toBeUndefined();
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "post",
      201,
      body,
    );

    const conversation = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers });
    expect(conversation.json().lastMessagePreview).toBe("hi");
    expect(conversation.json().lastMessageAt).toBe(body.createdAt);
  });

  it("AC3: content-empty + attachment-only is 201 with the attachment-count preview", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");

    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "", attachmentNames: ["a.pdf"] },
    });
    expect(res.statusCode).toBe(201);

    const conversation = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers });
    expect(conversation.json().lastMessagePreview).toBe("已傳送 1 個附件");
  });

  it("AC3: both content and attachmentNames empty is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");

    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "" },
    });
    expect(res.statusCode).toBe(400);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "post",
      400,
      res.json(),
    );
  });

  it("AC4: assistant message persists its state", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");

    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "answer", state: "NO_EVIDENCE" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().state).toBe("NO_EVIDENCE");
  });

  it("AC4: assistant message with no state defaults to ANSWERED", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "answer" },
    });
    expect(res.json().state).toBe("ANSWERED");
  });

  it("AC4: an unknown state enum value is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "answer", state: "MADE_UP" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC4: role=user with a state is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi", state: "ANSWERED" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("an assistant message with attachmentNames is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "answer", attachmentNames: ["a.pdf"] },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC6: creates 2 change events (message.created, conversation.updated) in one write", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi" },
    });
    const events = db
      .prepare("select type from change_events where conversation_id = ? order by seq")
      .all(id);
    expect(events).toEqual([
      { type: "conversation.created" },
      { type: "message.created" },
      { type: "conversation.updated" },
    ]);
    expect(res.statusCode).toBe(201);
  });

  it("records origin_client_id on the message.created event", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice", { "x-client-id": "client-xyz" });
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi" },
    });
    const row = db
      .prepare("select origin_client_id from change_events where type = 'message.created' and message_id = ?")
      .get(res.json().id) as { origin_client_id: string };
    expect(row.origin_client_id).toBe("client-xyz");
  });

  it("AC7: 403s for another owner's conversation and creates no message", async () => {
    const { app, db } = await build();
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers: authHeaders("bob"),
      payload: { role: "user", content: "hijack" },
    });
    expect(res.statusCode).toBe(403);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "post",
      403,
      res.json(),
    );
    expect(db.prepare("select count(*) as n from messages").get()).toEqual({ n: 0 });
  });

  it("404s for a conversation that never existed", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/00000000-0000-0000-0000-000000000000/messages",
      headers: authHeaders("alice"),
      payload: { role: "user", content: "hi" },
    });
    expect(res.statusCode).toBe(404);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages",
      "post",
      404,
      res.json(),
    );
  });

  it("AC8: content over 20,000 chars is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "x".repeat(20001) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC8: attachmentNames over the contract's cap (10) is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "", attachmentNames: Array.from({ length: 11 }, (_, i) => `f${i}.pdf`) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unknown body field", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi", nope: true },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("POST .../messages/:id/revisions (AC5, AC7, AC9)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/x/messages/y/revisions",
      payload: { content: "z" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("AC5: revises an assistant message, oldest content first, accumulating across 2 revisions", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const created = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "v1" },
    });
    const messageId = created.json().id as string;

    const r1 = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages/${messageId}/revisions`,
      headers,
      payload: { content: "v2" },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json().content).toBe("v2");
    expect(r1.json().revisions).toEqual(["v1"]);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/revisions",
      "post",
      200,
      r1.json(),
    );

    const r2 = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages/${messageId}/revisions`,
      headers,
      payload: { content: "v3", state: "PARTIAL" },
    });
    expect(r2.json().revisions).toEqual(["v1", "v2"]);
    expect(r2.json().state).toBe("PARTIAL");
  });

  it("AC5: revising a user message is 400", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const created = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "user", content: "hi" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages/${created.json().id}/revisions`,
      headers,
      payload: { content: "rewritten" },
    });
    expect(res.statusCode).toBe(400);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/revisions",
      "post",
      400,
      res.json(),
    );
  });

  it("AC6: appends exactly 1 message.updated change event", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const id = await createConversation(app, "alice");
    const created = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers,
      payload: { role: "assistant", content: "v1" },
    });
    await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages/${created.json().id}/revisions`,
      headers,
      payload: { content: "v2" },
    });
    const events = db
      .prepare("select type from change_events where conversation_id = ? order by seq")
      .all(id);
    expect(events).toEqual([
      { type: "conversation.created" },
      { type: "message.created" },
      { type: "conversation.updated" },
      { type: "message.updated" },
    ]);
  });

  it("AC7: 403s for another owner's conversation", async () => {
    const { app } = await build();
    const id = await createConversation(app, "alice");
    const created = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages`,
      headers: authHeaders("alice"),
      payload: { role: "assistant", content: "v1" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id}/messages/${created.json().id}/revisions`,
      headers: authHeaders("bob"),
      payload: { content: "hijack" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("AC9: 404s for a messageId that belongs to a different conversation", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const id1 = await createConversation(app, "alice");
    const id2 = await createConversation(app, "alice");
    const created = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id1}/messages`,
      headers,
      payload: { role: "assistant", content: "v1" },
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/conversations/${id2}/messages/${created.json().id}/revisions`,
      headers,
      payload: { content: "v2" },
    });
    expect(res.statusCode).toBe(404);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/revisions",
      "post",
      404,
      res.json(),
    );
  });

  it("404s for a conversation that never existed", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations/00000000-0000-0000-0000-000000000000/messages/anything/revisions",
      headers: authHeaders("alice"),
      payload: { content: "v2" },
    });
    expect(res.statusCode).toBe(404);
  });
});
