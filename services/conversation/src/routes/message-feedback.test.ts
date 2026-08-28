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

function authHeaders(userId: string) {
  return { [TEST_USER_HEADER]: userId };
}

const registry: ContractCheckRegistry = await loadConversationsContract();

async function createAssistantMessage(
  app: FastifyInstance,
  userId: string,
  content = "答案。[1][2]",
): Promise<{ conversationId: string; messageId: string }> {
  const conv = await app.inject({ method: "POST", url: "/v1/conversations", headers: authHeaders(userId) });
  const conversationId = conv.json().id as string;
  const msg = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: authHeaders(userId),
    payload: { role: "assistant", content },
  });
  return { conversationId, messageId: msg.json().id as string };
}

async function createUserMessage(app: FastifyInstance, userId: string, conversationId: string): Promise<string> {
  const msg = await app.inject({
    method: "POST",
    url: `/v1/conversations/${conversationId}/messages`,
    headers: authHeaders(userId),
    payload: { role: "user", content: "hi" },
  });
  return msg.json().id as string;
}

describe("PUT .../feedback (AC1, AC5)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/x/messages/y/feedback",
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("AC1: upserts OK then NG, ending on NG, both 200", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");

    const ok = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().feedback).toBe("OK");
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/feedback",
      "put",
      200,
      ok.json(),
    );

    const ng = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "NG" },
    });
    expect(ng.statusCode).toBe(200);
    expect(ng.json().feedback).toBe("NG");
  });

  it("an unknown verdict is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "MAYBE" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC5: 400 for a user message", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const conv = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const conversationId = conv.json().id as string;
    const messageId = await createUserMessage(app, "alice", conversationId);

    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC5: 403 for another owner's conversation, and 401 with no session", async () => {
    const { app } = await build();
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers: authHeaders("bob"),
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(403);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/feedback",
      "put",
      403,
      res.json(),
    );
  });

  it("404s for a nonexistent message", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const conv = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conv.json().id}/messages/00000000-0000-0000-0000-000000000000/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("AC6: appends a message.updated change event", async () => {
    const { app, db } = await build();
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers: authHeaders("alice"),
      payload: { verdict: "OK" },
    });
    const events = db
      .prepare("select type from change_events where message_id = ? order by seq")
      .all(messageId);
    expect(events).toEqual([{ type: "message.created" }, { type: "message.updated" }]);
  });
});

describe("PUT .../feedback/reason (AC2)", () => {
  it("400 when feedback is absent or OK; 200 + persists when NG", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");

    const noFeedback = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers,
      payload: { reason: "INCOMPLETE" },
    });
    expect(noFeedback.statusCode).toBe(400);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/feedback/reason",
      "put",
      400,
      noFeedback.json(),
    );

    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const withOk = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers,
      payload: { reason: "INCOMPLETE" },
    });
    expect(withOk.statusCode).toBe(400);

    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "NG" },
    });
    const withNg = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers,
      payload: { reason: "INCOMPLETE" },
    });
    expect(withNg.statusCode).toBe(200);
    expect(withNg.json().feedbackReason).toBe("INCOMPLETE");
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/feedback/reason",
      "put",
      200,
      withNg.json(),
    );
  });

  it("an unknown reason enum value is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "NG" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers,
      payload: { reason: "BECAUSE" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT .../feedback/comment (AC3)", () => {
  it("400 with no prior verdict; 200 once a verdict exists", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");

    const noVerdict = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers,
      payload: { comment: "很有幫助" },
    });
    expect(noVerdict.statusCode).toBe(400);

    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers,
      payload: { comment: "很有幫助" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().feedbackComment).toBe("很有幫助");
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/feedback/comment",
      "put",
      200,
      res.json(),
    );
  });

  it("a whitespace-only comment is 400 after trimming", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers,
      payload: { comment: "   " },
    });
    expect(res.statusCode).toBe(400);
  });

  it("a comment over 500 chars is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice");
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers,
      payload: { comment: "x".repeat(501) },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("PUT .../citations/:citationId/feedback (AC4, AC7)", () => {
  it("400 for a citation id not present in content; 200 and persists for one that is", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice", "答案。[1]");

    const missing = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/2/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    expect(missing.statusCode).toBe(400);
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/citations/{citationId}/feedback",
      "put",
      400,
      missing.json(),
    );

    const present = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    expect(present.statusCode).toBe(200);
    expect(present.json().citationFeedback).toEqual({ "1": "OK" });
    expectResponseMatchesContract(
      registry,
      "/conversations/{conversationId}/messages/{messageId}/citations/{citationId}/feedback",
      "put",
      200,
      present.json(),
    );
  });

  it("multiple citations do not overwrite each other", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice", "答案。[1][2]");

    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/2/feedback`,
      headers,
      payload: { verdict: "NG" },
    });
    expect(res.json().citationFeedback).toEqual({ "1": "OK", "2": "NG" });
  });

  it("AC7: all 4 feedback dimensions coexist without overwriting each other", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const { conversationId, messageId } = await createAssistantMessage(app, "alice", "答案。[1]");

    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback`,
      headers,
      payload: { verdict: "NG" },
    });
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/reason`,
      headers,
      payload: { reason: "INCOMPLETE" },
    });
    await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/feedback/comment`,
      headers,
      payload: { comment: "留言" },
    });
    const final = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
      headers,
      payload: { verdict: "OK" },
    });
    const body = final.json();
    expect(body.feedback).toBe("NG");
    expect(body.feedbackReason).toBe("INCOMPLETE");
    expect(body.feedbackComment).toBe("留言");
    expect(body.citationFeedback).toEqual({ "1": "OK" });
  });

  it("403s for another owner's conversation", async () => {
    const { app } = await build();
    const { conversationId, messageId } = await createAssistantMessage(app, "alice", "答案。[1]");
    const res = await app.inject({
      method: "PUT",
      url: `/v1/conversations/${conversationId}/messages/${messageId}/citations/1/feedback`,
      headers: authHeaders("bob"),
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "PUT",
      url: "/v1/conversations/x/messages/y/citations/1/feedback",
      payload: { verdict: "OK" },
    });
    expect(res.statusCode).toBe(401);
  });
});
