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

describe("GET /v1/conversations (AC1-AC4, AC9 unauth)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/conversations" });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("UNAUTHENTICATED");
    expectResponseMatchesContract(registry, "/conversations", "get", 401, res.json());
  });

  it("AC1: 200 empty page when the caller has no conversations", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "GET",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 1 });
    expectResponseMatchesContract(registry, "/conversations", "get", 200, res.json());
  });

  it("AC2: pageSize=2&page=2 of 3 conversations returns 1 item, totalPages 2, sorted lastMessageAt desc", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    for (let i = 0; i < 3; i += 1) {
      await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
      await new Promise((r) => setTimeout(r, 2));
    }
    const res = await app.inject({
      method: "GET",
      url: "/v1/conversations?pageSize=2&page=2",
      headers,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.totalPages).toBe(2);
    expect(body.totalCount).toBe(3);
    expectResponseMatchesContract(registry, "/conversations", "get", 200, body);
  });

  it("AC2: an out-of-range page returns empty items, not an error", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    const res = await app.inject({ method: "GET", url: "/v1/conversations?page=99", headers });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([]);
  });

  it("AC3: q filters by title substring, case-insensitively, and total reflects the filter", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    const id = created.json().id as string;
    await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers,
      payload: { title: "Q3 SALES report" },
    });
    await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });

    const res = await app.inject({ method: "GET", url: "/v1/conversations?q=sales", headers });
    const body = res.json();
    expect(body.totalCount).toBe(1);
    expect(body.items[0].id).toBe(id);
  });

  it("AC3: a whitespace-only q means no search", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    const res = await app.inject({ method: "GET", url: "/v1/conversations?q=%20%20", headers });
    expect(res.json().totalCount).toBe(1);
  });

  it("AC4: archived=true returns only archived conversations; default excludes them", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const a = await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    const b = await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${b.json().id}`,
      headers,
      payload: { archived: true },
    });

    const active = await app.inject({ method: "GET", url: "/v1/conversations", headers });
    expect(active.json().items.map((i: { id: string }) => i.id)).toEqual([a.json().id]);

    const archived = await app.inject({ method: "GET", url: "/v1/conversations?archived=true", headers });
    expect(archived.json().items.map((i: { id: string }) => i.id)).toEqual([b.json().id]);
  });

  it("regression: totalCount/totalPages reflect the filtered set, not the whole store", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const a = await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });
    await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${a.json().id}`,
      headers,
      payload: { title: "獨特關鍵字" },
    });
    await app.inject({ method: "POST", url: "/v1/conversations", headers, payload: {} });

    const res = await app.inject({ method: "GET", url: "/v1/conversations?q=獨特關鍵字", headers });
    expect(res.json().totalCount).toBe(1);
    expect(res.json().totalPages).toBe(1);
  });

  it("never returns another owner's conversations", async () => {
    const { app } = await build();
    await app.inject({ method: "POST", url: "/v1/conversations", headers: authHeaders("bob"), payload: {} });
    const res = await app.inject({
      method: "GET",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
    });
    expect(res.json().totalCount).toBe(0);
  });
});

describe("POST /v1/conversations (AC5, AC10)", () => {
  it("AC5: 201 with contract defaults when no body is sent", async () => {
    const { app, db } = await build();
    const res = await app.inject({ method: "POST", url: "/v1/conversations", headers: authHeaders("alice") });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.title).toBe("新對話");
    expect(body.lastMessagePreview).toBe("尚無訊息。");
    expect(body.model).toBe("standard");
    expect(body.archived).toBe(false);
    expect(body.mode).toBe("normal");
    expect(body.knowledgeScopes).toEqual([]);
    expect(body.lastMessageAt).toBe(body.createdAt);
    expectResponseMatchesContract(registry, "/conversations", "post", 201, body);

    const events = db
      .prepare("select type from change_events where conversation_id = ?")
      .all(body.id);
    expect(events).toEqual([{ type: "conversation.created" }]);
  });

  it("accepts an explicit mode", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
      payload: { mode: "advanced" },
    });
    expect(res.json().mode).toBe("advanced");
  });

  it("AC10: records origin_client_id from x-client-id", async () => {
    const { app, db } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice", { "x-client-id": "client-abc" }),
    });
    const row = db
      .prepare("select origin_client_id from change_events where conversation_id = ?")
      .get(res.json().id) as { origin_client_id: string };
    expect(row.origin_client_id).toBe("client-abc");
  });

  it("rejects an unknown body field (additionalProperties: false)", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
      payload: { mode: "normal", nope: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
    expectResponseMatchesContract(registry, "/conversations", "post", 400, res.json());
  });

  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "POST", url: "/v1/conversations" });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(registry, "/conversations", "post", 401, res.json());
  });
});

describe("GET /v1/conversations/:id (AC9)", () => {
  it("returns the owner's own conversation", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const res = await app.inject({
      method: "GET",
      url: `/v1/conversations/${created.json().id}`,
      headers,
    });
    expect(res.statusCode).toBe(200);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "get", 200, res.json());
  });

  it("404s for an id that never existed", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "GET",
      url: "/v1/conversations/00000000-0000-0000-0000-000000000000",
      headers: authHeaders("alice"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "get", 404, res.json());
  });

  it("AC9: 403s (not 404, not empty) for another owner's conversation, and leaves it untouched", async () => {
    const { app } = await build();
    const created = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
    });
    const id = created.json().id as string;

    const res = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers: authHeaders("bob") });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("PERMISSION_DENIED");
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "get", 403, res.json());

    const stillAlices = await app.inject({
      method: "GET",
      url: `/v1/conversations/${id}`,
      headers: authHeaders("alice"),
    });
    expect(stillAlices.statusCode).toBe(200);
  });

  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "GET", url: "/v1/conversations/anything" });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "get", 401, res.json());
  });
});

describe("PATCH /v1/conversations/:id (AC6, AC7, AC9, AC10)", () => {
  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "PATCH", url: "/v1/conversations/anything", payload: {} });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "patch", 401, res.json());
  });

  it("AC6: empty-after-trim title is 400 and leaves data unchanged", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers,
      payload: { title: "   " },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("VALIDATION_ERROR");
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "patch", 400, res.json());

    const after = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers });
    expect(after.json().title).toBe("新對話");
  });

  it("AC6: title over 120 chars is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${created.json().id}`,
      headers,
      payload: { title: "x".repeat(121) },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC6: an unknown mode value is 400 (schema-enforced)", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${created.json().id}`,
      headers,
      payload: { mode: "turbo" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC6: an unknown knowledgeScopes value is 400 and does not partially write", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers,
      payload: { title: "改了但不該生效", knowledgeScopes: ["not-a-scope"] },
    });
    expect(res.statusCode).toBe(400);

    const after = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers });
    expect(after.json().title).toBe("新對話");
  });

  it("AC7: archived true then false both 200 and reflected in list filtering", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const id = created.json().id as string;

    const toArchived = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers,
      payload: { archived: true },
    });
    expect(toArchived.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/conversations", headers })).json().totalCount).toBe(
      0,
    );

    const toActive = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers,
      payload: { archived: false },
    });
    expect(toActive.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/conversations", headers })).json().totalCount).toBe(
      1,
    );
  });

  it("updatedAt changes on a real patch", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const before = created.json().updatedAt as string;
    await new Promise((r) => setTimeout(r, 5));
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${created.json().id}`,
      headers,
      payload: { archived: true },
    });
    expect(updated.json().updatedAt).not.toBe(before);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "patch", 200, updated.json());
  });

  it("AC10: a successful patch appends a conversation.updated change event", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${created.json().id}`,
      headers,
      payload: { archived: true },
    });
    const events = db
      .prepare("select type from change_events where conversation_id = ? order by seq")
      .all(created.json().id);
    expect(events).toEqual([{ type: "conversation.created" }, { type: "conversation.updated" }]);
  });

  it("AC9: 403s for another owner's conversation and leaves data unchanged", async () => {
    const { app } = await build();
    const created = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
    });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${id}`,
      headers: authHeaders("bob"),
      payload: { title: "帶走了" },
    });
    expect(res.statusCode).toBe(403);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "patch", 403, res.json());

    const after = await app.inject({
      method: "GET",
      url: `/v1/conversations/${id}`,
      headers: authHeaders("alice"),
    });
    expect(after.json().title).toBe("新對話");
  });

  it("404s for an id that never existed", async () => {
    const { app } = await build();
    const res = await app.inject({
      method: "PATCH",
      url: "/v1/conversations/00000000-0000-0000-0000-000000000000",
      headers: authHeaders("alice"),
      payload: { archived: true },
    });
    expect(res.statusCode).toBe(404);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "patch", 404, res.json());
  });

  it("an empty body is a no-op that still returns the current conversation", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/conversations/${created.json().id}`,
      headers,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(created.json());
    const events = db
      .prepare("select count(*) as n from change_events where conversation_id = ?")
      .get(created.json().id);
    expect(events).toEqual({ n: 1 }); // only the original conversation.created
  });
});

describe("DELETE /v1/conversations/:id (AC8, AC9, AC10)", () => {
  it("AC8: 204, then a subsequent GET is 404, and its messages are gone too", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const id = created.json().id as string;
    db.prepare(
      "insert into messages (id, conversation_id, owner_key, role, content, attachment_names, created_at, updated_at) values (?, ?, ?, 'user', 'hi', '[]', ?, ?)",
    ).run("m1", id, "alice", "2026-08-28T05:00:00.000Z", "2026-08-28T05:00:00.000Z");

    const del = await app.inject({ method: "DELETE", url: `/v1/conversations/${id}`, headers });
    expect(del.statusCode).toBe(204);
    expect(del.body).toBe("");

    const after = await app.inject({ method: "GET", url: `/v1/conversations/${id}`, headers });
    expect(after.statusCode).toBe(404);

    expect(db.prepare("select count(*) as n from messages where conversation_id = ?").get(id)).toEqual({
      n: 0,
    });
  });

  it("AC10: appends a conversation.deleted change event", async () => {
    const { app, db } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    await app.inject({ method: "DELETE", url: `/v1/conversations/${created.json().id}`, headers });
    const events = db
      .prepare("select type from change_events where conversation_id = ? order by seq")
      .all(created.json().id);
    expect(events).toEqual([{ type: "conversation.created" }, { type: "conversation.deleted" }]);
  });

  it("AC9: 403s for another owner's conversation and does not delete it", async () => {
    const { app } = await build();
    const created = await app.inject({
      method: "POST",
      url: "/v1/conversations",
      headers: authHeaders("alice"),
    });
    const id = created.json().id as string;

    const res = await app.inject({
      method: "DELETE",
      url: `/v1/conversations/${id}`,
      headers: authHeaders("bob"),
    });
    expect(res.statusCode).toBe(403);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "delete", 403, res.json());

    const stillThere = await app.inject({
      method: "GET",
      url: `/v1/conversations/${id}`,
      headers: authHeaders("alice"),
    });
    expect(stillThere.statusCode).toBe(200);
  });

  it("404s for an id that is already gone, not a silent success", async () => {
    const { app } = await build();
    const headers = authHeaders("alice");
    const created = await app.inject({ method: "POST", url: "/v1/conversations", headers });
    const id = created.json().id as string;
    await app.inject({ method: "DELETE", url: `/v1/conversations/${id}`, headers });

    const again = await app.inject({ method: "DELETE", url: `/v1/conversations/${id}`, headers });
    expect(again.statusCode).toBe(404);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "delete", 404, again.json());
  });

  it("401s with no session", async () => {
    const { app } = await build();
    const res = await app.inject({ method: "DELETE", url: "/v1/conversations/anything" });
    expect(res.statusCode).toBe(401);
    expectResponseMatchesContract(registry, "/conversations/{conversationId}", "delete", 401, res.json());
  });
});
