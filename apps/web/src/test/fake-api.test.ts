import { beforeEach, describe, expect, it } from "vitest";
import { failNextRequest, fakeFetch, resetFakeApi, seedSampleConversations } from "./fake-api";

function req(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost/api/v1${path}`, init);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } };
}

describe("fake-api contract self-validation (E03-S036 Contract Test Obligation)", () => {
  beforeEach(() => {
    resetFakeApi();
    seedSampleConversations();
  });

  it("serves list/create/get/patch/delete responses that all pass Ajv validation against contracts/openapi/conversations.yaml", async () => {
    const list = await fakeFetch(req("/conversations"));
    expect(list.status).toBe(200);

    const created = await fakeFetch(req("/conversations", { method: "POST" }));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };

    const got = await fakeFetch(req(`/conversations/${id}`));
    expect(got.status).toBe(200);

    const patched = await fakeFetch(req(`/conversations/${id}`, jsonInit("PATCH", { title: "改名" })));
    expect(patched.status).toBe(200);

    const deleted = await fakeFetch(req(`/conversations/${id}`, { method: "DELETE" }));
    expect(deleted.status).toBe(204);
  });

  it("rejects an UpdateConversationRequest with an invalid enum value — proves drift/malformed input is actually caught, not silently accepted", async () => {
    const created = await fakeFetch(req("/conversations", { method: "POST" }));
    const { id } = (await created.json()) as { id: string };

    await expect(fakeFetch(req(`/conversations/${id}`, jsonInit("PATCH", { mode: "not-a-real-mode" })))).rejects.toThrow(
      /failed contract validation/,
    );
  });

  it("rejects an UpdateConversationRequest with an unknown field (additionalProperties: false)", async () => {
    const created = await fakeFetch(req("/conversations", { method: "POST" }));
    const { id } = (await created.json()) as { id: string };

    await expect(fakeFetch(req(`/conversations/${id}`, jsonInit("PATCH", { notARealField: true })))).rejects.toThrow(
      /failed contract validation/,
    );
  });

  it("failNextRequest forces exactly the next call to fail with the given code and status", async () => {
    failNextRequest("PERMISSION_DENIED");

    const first = await fakeFetch(req("/conversations"));
    expect(first.status).toBe(403);
    expect(((await first.json()) as { code: string }).code).toBe("PERMISSION_DENIED");

    const second = await fakeFetch(req("/conversations"));
    expect(second.status).toBe(200);
  });

  it("rejects a non-UUID conversationId path param with 400 VALIDATION_ERROR", async () => {
    const result = await fakeFetch(req("/conversations/not-a-uuid"));

    expect(result.status).toBe(400);
    expect(((await result.json()) as { code: string }).code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 NOT_FOUND for a syntactically valid but nonexistent conversationId", async () => {
    const result = await fakeFetch(req(`/conversations/${crypto.randomUUID()}`));

    expect(result.status).toBe(404);
    expect(((await result.json()) as { code: string }).code).toBe("NOT_FOUND");
  });
});
