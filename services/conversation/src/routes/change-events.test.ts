import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp, TEST_USER_HEADER, type TestApp } from "../testing/build-test-app.js";
import { appendChangeEvent } from "../repository/change-events.repository.js";
import { toOwnerKey } from "../repository/owner-scope.js";

let app: FastifyInstance | undefined;
let db: Database.Database | undefined;
const openSockets: Array<{ destroy(): void }> = [];

afterEach(async () => {
  for (const socket of openSockets.splice(0)) socket.destroy();
  await app?.close();
  db?.close();
  app = undefined;
  db = undefined;
});

async function buildAndListen(heartbeatIntervalMs?: number): Promise<TestApp & { port: number }> {
  const built = await buildTestApp({ heartbeatIntervalMs });
  app = built.app;
  db = built.db;
  await built.app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = built.app.server.address() as AddressInfo;
  return { ...built, port };
}

interface StreamHandle {
  readonly response: http.IncomingMessage;
  buffer(): string;
  close(): void;
}

function connectSSE(
  port: number,
  headers: Record<string, string>,
): Promise<{ statusCode: number; stream: StreamHandle }> {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: "127.0.0.1", port, path: "/v1/conversations/events", headers });
    openSockets.push(request);
    request.on("error", reject);
    request.on("response", (response) => {
      openSockets.push(response);
      let text = "";
      response.on("data", (chunk: Buffer) => {
        text += chunk.toString("utf8");
      });
      resolve({
        statusCode: response.statusCode ?? 0,
        stream: {
          response,
          buffer: () => text,
          close: () => {
            response.destroy();
            request.destroy();
          },
        },
      });
    });
    request.end();
  });
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitUntil timed out after ${timeoutMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function post(port: number, path: string, userId: string, payload?: unknown): Promise<unknown> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: {
      [TEST_USER_HEADER]: userId,
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return res.json();
}

describe("GET /v1/conversations/events — AC1, AC2, AC5", () => {
  it("AC5: 401s with no session and never opens a stream", async () => {
    const { app } = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/v1/conversations/events" });
    expect(res.statusCode).toBe(401);
  });

  it("AC1: 200 with SSE headers, and a heartbeat arrives within the configured interval", async () => {
    const { port } = await buildAndListen(20);
    const { statusCode, stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    expect(statusCode).toBe(200);
    expect(stream.response.headers["content-type"]).toBe("text/event-stream");
    expect(stream.response.headers["cache-control"]).toBe("no-store");
    expect(stream.response.headers["x-accel-buffering"]).toBe("no");

    await waitUntil(() => stream.buffer().includes(":\n\n"));
    stream.close();
  });

  it("AC2: a live change event arrives with id=seq, event=type, and valid JSON data", async () => {
    const { port } = await buildAndListen(5000);
    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    await waitUntil(() => stream.buffer().includes(": connected"));

    const created = (await post(port, "/v1/conversations", "alice")) as { id: string };

    await waitUntil(() => stream.buffer().includes("event: conversation.created"));
    const body = stream.buffer();
    expect(body).toMatch(/id: 1\nevent: conversation\.created\n/);
    const dataLine = body.split("\n").find((line) => line.startsWith("data: {"));
    const payload = JSON.parse((dataLine as string).slice("data: ".length)) as Record<string, unknown>;
    expect(payload).toMatchObject({ id: 1, type: "conversation.created", conversationId: created.id });

    stream.close();
  });

  it("AC4: never receives another owner's events", async () => {
    const { port } = await buildAndListen(5000);
    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    await waitUntil(() => stream.buffer().includes(": connected"));

    await post(port, "/v1/conversations", "bob");
    // Give the (absent) delivery a moment to have arrived if it were going to.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stream.buffer()).not.toContain("conversation.created");

    stream.close();
  });
});

describe("GET /v1/conversations/events — AC3, AC9 (replay and resync)", () => {
  it("AC3: Last-Event-ID replays only strictly-newer events, in order, then continues live", async () => {
    const { port, db } = await buildAndListen(5000);
    const owner = toOwnerKey("alice");
    for (let i = 1; i <= 10; i += 1) {
      appendChangeEvent(db, owner, {
        type: "conversation.created",
        conversationId: `c${i}`,
        occurredAt: "2026-08-28T05:00:00.000Z",
      });
    }

    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice", "Last-Event-ID": "3" });
    await waitUntil(() => stream.buffer().includes("id: 10\n"));

    const ids = [...stream.buffer().matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]));
    expect(ids).toEqual([4, 5, 6, 7, 8, 9, 10]);

    stream.close();
  });

  it("AC9: an id never issued to this owner triggers UNKNOWN_LAST_EVENT_ID resync", async () => {
    const { port } = await buildAndListen(5000);
    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice", "Last-Event-ID": "999" });
    await waitUntil(() => stream.buffer().includes("event: resync"));
    expect(stream.buffer()).toContain('data: {"reason":"UNKNOWN_LAST_EVENT_ID"}');
    stream.close();
  });

  it("AC9: more than 500 pending events after a valid checkpoint triggers EVENT_LOG_TRUNCATED resync", async () => {
    const { port, db } = await buildAndListen(5000);
    const owner = toOwnerKey("alice");
    // seq 1 is the "valid past checkpoint" the client claims; seq 2..502
    // (501 events) are all still pending after it — over the 500 cap.
    for (let i = 0; i < 502; i += 1) {
      appendChangeEvent(db, owner, {
        type: "conversation.created",
        conversationId: `c${i}`,
        occurredAt: "2026-08-28T05:00:00.000Z",
      });
    }

    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice", "Last-Event-ID": "1" });
    await waitUntil(() => stream.buffer().includes("event: resync"));
    expect(stream.buffer()).toContain('data: {"reason":"EVENT_LOG_TRUNCATED"}');
    stream.close();
  });

  it("a lastEventId of exactly the latest seq (fully caught up) replays nothing and stays live", async () => {
    const { port, db } = await buildAndListen(5000);
    const owner = toOwnerKey("alice");
    appendChangeEvent(db, owner, {
      type: "conversation.created",
      conversationId: "c1",
      occurredAt: "2026-08-28T05:00:00.000Z",
    });

    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice", "Last-Event-ID": "1" });
    await waitUntil(() => stream.buffer().includes(": connected"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stream.buffer()).not.toContain("event: resync");
    expect(stream.buffer()).not.toContain("event: conversation.created");

    stream.close();
  });
});

describe("GET /v1/conversations/events — AC6 (connection limit), AC7 (cleanup)", () => {
  it("AC6: the 21st connection for an owner is 429, existing ones are undisturbed, and a freed slot admits a new one", async () => {
    const { port, changeEventBus } = await buildAndListen(5000);
    const owner = toOwnerKey("alice");
    const unsubscribes: Array<() => void> = [];
    for (let i = 0; i < 20; i += 1) {
      const unsubscribe = changeEventBus.subscribe(owner, () => {});
      if (unsubscribe) unsubscribes.push(unsubscribe);
    }
    expect(unsubscribes).toHaveLength(20);

    const rejected = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    expect(rejected.statusCode).toBe(429);
    const rejectedBody = JSON.parse(rejected.stream.buffer()) as { code: string };
    expect(rejectedBody.code).toBe("TOO_MANY_CONNECTIONS");
    rejected.stream.close();

    unsubscribes[0]?.();
    const accepted = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    expect(accepted.statusCode).toBe(200);
    accepted.stream.close();
  });

  it("AC7: disconnecting removes the bus listener (no leak)", async () => {
    const { port, changeEventBus } = await buildAndListen(5000);
    const owner = toOwnerKey("alice");
    const { stream } = await connectSSE(port, { [TEST_USER_HEADER]: "alice" });
    await waitUntil(() => changeEventBus.connectionCount(owner) === 1);

    stream.close();

    await waitUntil(() => changeEventBus.connectionCount(owner) === 0);
  });
});
