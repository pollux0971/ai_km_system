import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp, TEST_ROLES_HEADER, TEST_USER_HEADER } from "../testing/build-test-app.js";
import { expectResponseMatchesContract, loadAnalyticsContract } from "../testing/contract-check.js";
import { insertUsageEvent } from "../repository/usage-events.repository.js";

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

const AUDITOR_HEADERS = { [TEST_USER_HEADER]: "auditor-1", [TEST_ROLES_HEADER]: "auditor" };

describe("GET /v1/admin/metrics/usage (E13-S019 AC2)", () => {
  it("AC2: two users on the same day -> dailyActiveUsers 2, questionsAsked counts conversation_message_sent", async () => {
    const { db } = await build();
    insertUsageEvent(db, {
      id: "e1",
      ownerKey: "alice",
      userId: "alice",
      name: "conversation_message_sent",
      occurredAt: "2026-08-28T01:00:00.000Z",
      receivedAt: "2026-08-28T01:00:00.000Z",
    });
    insertUsageEvent(db, {
      id: "e2",
      ownerKey: "bob",
      userId: "bob",
      name: "conversation_message_sent",
      occurredAt: "2026-08-28T02:00:00.000Z",
      receivedAt: "2026-08-28T02:00:00.000Z",
    });

    const res = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/usage?date=2026-08-28",
      headers: AUDITOR_HEADERS,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ date: "2026-08-28", dailyActiveUsers: 2, questionsAsked: 2 });

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/metrics/usage", "get", 200, body);
  });

  it("AC2: a day with no events reports 0/0", async () => {
    await build();
    const res = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/usage?date=2026-01-01",
      headers: AUDITOR_HEADERS,
    });
    expect(res.json()).toEqual({ date: "2026-01-01", dailyActiveUsers: 0, questionsAsked: 0 });
  });

  it("Security AC: unauthenticated is 401 (a valid date is sent, isolating the auth check)", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/metrics/usage?date=2026-08-28" });
    expect(res.statusCode).toBe(401);
  });

  it("Security AC: demo-user-shaped role (general_user) is 403", async () => {
    await build();
    const res = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/usage?date=2026-08-28",
      headers: { [TEST_USER_HEADER]: "u1", [TEST_ROLES_HEADER]: "general_user" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("super_administrator always passes, without being in the endpoint's own role list literally re-stated", async () => {
    await build();
    const res = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/usage?date=2026-08-28",
      headers: { [TEST_USER_HEADER]: "u1", [TEST_ROLES_HEADER]: "super_administrator" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("missing required `date` is 400", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/metrics/usage", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /v1/admin/metrics/latency (E13-S019 AC3)", () => {
  it("AC3: averages 100/200/300 to 200, sampleCount 3", async () => {
    const { db } = await build();
    for (const [id, latencyMs] of [
      ["e1", 100],
      ["e2", 200],
      ["e3", 300],
    ] as const) {
      insertUsageEvent(db, {
        id,
        ownerKey: "alice",
        userId: "alice",
        name: "rag_answer_outcome",
        latencyMs,
        occurredAt: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      });
    }

    const res = await app!.inject({ method: "GET", url: "/v1/admin/metrics/latency", headers: AUDITOR_HEADERS });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({ averageLatencyMs: 200, sampleCount: 3 });

    const registry = await loadAnalyticsContract();
    expectResponseMatchesContract(registry, "/admin/metrics/latency", "get", 200, body);
  });

  it("AC3: zero samples reports averageLatencyMs null, sampleCount 0", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/metrics/latency", headers: AUDITOR_HEADERS });
    expect(res.json()).toEqual({ averageLatencyMs: null, sampleCount: 0 });
  });

  it("Security AC: unauthenticated is 401", async () => {
    await build();
    const res = await app!.inject({ method: "GET", url: "/v1/admin/metrics/latency" });
    expect(res.statusCode).toBe(401);
  });

  it("Security AC: general_user is 403", async () => {
    await build();
    const res = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/latency",
      headers: { [TEST_USER_HEADER]: "u1", [TEST_ROLES_HEADER]: "general_user" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("`days` defaults to 7 and honours an explicit override", async () => {
    const { db } = await build();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    insertUsageEvent(db, {
      id: "e1",
      ownerKey: "alice",
      userId: "alice",
      name: "rag_answer_outcome",
      latencyMs: 999,
      occurredAt: eightDaysAgo,
      receivedAt: eightDaysAgo,
    });

    const withDefault = await app!.inject({ method: "GET", url: "/v1/admin/metrics/latency", headers: AUDITOR_HEADERS });
    expect(withDefault.json()).toMatchObject({ sampleCount: 0 });

    const with30Days = await app!.inject({
      method: "GET",
      url: "/v1/admin/metrics/latency?days=30",
      headers: AUDITOR_HEADERS,
    });
    expect(with30Days.json()).toMatchObject({ sampleCount: 1 });
  });
});
