import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp, TEST_USER_HEADER } from "../testing/build-test-app.js";
import { loadAnalyticsContract, expectResponseMatchesContract } from "../testing/contract-check.js";

let app: FastifyInstance | undefined;
let db: Database.Database | undefined;

afterEach(async () => {
  await app?.close();
  db?.close();
  app = undefined;
  db = undefined;
});

async function build(): Promise<FastifyInstance> {
  const built = await buildTestApp();
  app = built.app;
  db = built.db;
  return app;
}

describe("POST /v1/usage-events (E13-S019 AC1)", () => {
  it("AC1: 201 with a legal body, and the row's user_id/owner_key come from the session", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: { name: "conversation_created", occurredAt: "2026-08-28T05:00:00.000Z" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { id: string };
    expect(typeof body.id).toBe("string");

    const row = db!.prepare("SELECT * FROM usage_events WHERE id = ?").get(body.id) as Record<string, unknown>;
    expect(row.owner_key).toBe("alice");
    expect(row.user_id).toBe("alice");

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/usage-events", "post", 201, body);
  });

  it("AC1: a body with `userId` is 400 — additionalProperties:false rejects it, identity always comes from session", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: { name: "conversation_created", occurredAt: "2026-08-28T05:00:00.000Z", userId: "mallory" },
    });
    expect(res.statusCode).toBe(400);

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/usage-events", "post", 400, res.json());
  });

  it("AC1: an unknown field is 400 (whitelist, not a widened schema)", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: { name: "conversation_created", occurredAt: "2026-08-28T05:00:00.000Z", extra: "nope" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("AC1: unauthenticated is 401", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      payload: { name: "conversation_created", occurredAt: "2026-08-28T05:00:00.000Z" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("occurredAt more than 5 minutes in the future is 400", async () => {
    const server = await build();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: { name: "conversation_created", occurredAt: future },
    });
    expect(res.statusCode).toBe(400);
  });

  it("occurredAt a few seconds in the future (clock skew) is accepted", async () => {
    const server = await build();
    const soon = new Date(Date.now() + 2 * 60 * 1000).toISOString();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: { name: "conversation_created", occurredAt: soon },
    });
    expect(res.statusCode).toBe(201);
  });

  it("accepts the full rag_answer_outcome shape", async () => {
    const server = await build();
    const res = await server.inject({
      method: "POST",
      url: "/v1/usage-events",
      headers: { [TEST_USER_HEADER]: "alice" },
      payload: {
        name: "rag_answer_outcome",
        conversationId: "8f0d6b1e-0a5d-4a3c-9c2e-2f2c4a9a1b77",
        answerState: "ANSWERED",
        citationCount: 2,
        latencyMs: 1450,
        occurredAt: "2026-08-28T05:12:04.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
  });
});
