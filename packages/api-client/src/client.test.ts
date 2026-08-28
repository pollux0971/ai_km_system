// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createApiClient } from "./client";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fakeFetch(capture: Request[]): (input: Request) => Promise<Response> {
  return async (input) => {
    capture.push(input);
    return new Response(JSON.stringify({ items: [], pagination: { page: 1, pageSize: 20, total: 0 } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

describe("createApiClient", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("sends credentials:include, a v4 x-correlation-id, and an x-client-id on every request", async () => {
    const seen: Request[] = [];
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

    await client.conversations.GET("/conversations", {});

    expect(seen).toHaveLength(1);
    const req = seen[0]!;
    expect(req.credentials).toBe("include");
    expect(req.headers.get("x-correlation-id")).toMatch(UUID_V4_RE);
    expect(req.headers.get("x-client-id")).toBeTruthy();
  });

  it("reuses the same x-client-id across repeated calls in the same tab (sessionStorage-backed)", async () => {
    const seen: Request[] = [];
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

    await client.conversations.GET("/conversations", {});
    await client.conversations.GET("/conversations", {});

    expect(seen).toHaveLength(2);
    expect(seen[0]!.headers.get("x-client-id")).toBe(seen[1]!.headers.get("x-client-id"));
  });

  it("reuses the same tab's x-client-id across independently created client instances", async () => {
    const seenA: Request[] = [];
    const seenB: Request[] = [];
    const clientA = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seenA) });
    const clientB = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seenB) });

    await clientA.conversations.GET("/conversations", {});
    await clientB.conversations.GET("/conversations", {});

    expect(seenA[0]!.headers.get("x-client-id")).toBe(seenB[0]!.headers.get("x-client-id"));
  });

  it("gives each distinct tab (sessionStorage) a different x-client-id", async () => {
    const seen: Request[] = [];
    const first = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });
    await first.conversations.GET("/conversations", {});
    const firstId = seen[0]!.headers.get("x-client-id");

    sessionStorage.clear();

    const second = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });
    await second.conversations.GET("/conversations", {});
    const secondId = seen[1]!.headers.get("x-client-id");

    expect(secondId).not.toBe(firstId);
  });

  it("lets the caller override the auto-generated x-correlation-id", async () => {
    const seen: Request[] = [];
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

    await client.conversations.GET("/conversations", { headers: { "x-correlation-id": "caller-supplied-id" } });

    expect(seen[0]!.headers.get("x-correlation-id")).toBe("caller-supplied-id");
  });

  it("uses the explicit clientId option instead of touching sessionStorage when provided", async () => {
    const seen: Request[] = [];
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: fakeFetch(seen),
      clientId: "fixed-client-id",
    });

    await client.conversations.GET("/conversations", {});

    expect(seen[0]!.headers.get("x-client-id")).toBe("fixed-client-id");
    expect(sessionStorage.getItem("ai-km:client-id")).toBeNull();
  });

  it("exposes a typed client per spec (auth, conversations, transcriptions, core)", () => {
    const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch([]) });

    expect(client.core).toBeTruthy();
    expect(client.auth).toBeTruthy();
    expect(client.conversations).toBeTruthy();
    expect(client.transcriptions).toBeTruthy();
  });

  describe("clientId (E03-S039: exposed so a consumer can compare against a ChangeEvent's originClientId)", () => {
    it("exposes the resolved sessionStorage-backed clientId that was actually sent on the wire", async () => {
      const seen: Request[] = [];
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

      await client.conversations.GET("/conversations", {});

      expect(client.clientId).toBe(seen[0]!.headers.get("x-client-id"));
    });

    it("exposes the explicit clientId option when one was provided, without touching sessionStorage", () => {
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch([]), clientId: "fixed-client-id" });

      expect(client.clientId).toBe("fixed-client-id");
      expect(sessionStorage.getItem("ai-km:client-id")).toBeNull();
    });
  });

  describe("x-requested-with (E04-S048 CSRF defence, AC6)", () => {
    it("sends x-requested-with on every request, on every spec's client", async () => {
      const seen: Request[] = [];
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

      await client.conversations.GET("/conversations", {});
      await client.auth.GET("/auth/session", {});

      expect(seen).toHaveLength(2);
      expect(seen[0]!.headers.get("x-requested-with")).toBe("XMLHttpRequest");
      expect(seen[1]!.headers.get("x-requested-with")).toBe("XMLHttpRequest");
    });

    it("sends it on GET requests too, not just state-changing ones (this package never knows or cares which — apps/api's own CSRF check is what method-gates)", async () => {
      const seen: Request[] = [];
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

      await client.conversations.GET("/conversations", {});

      expect(seen[0]!.headers.get("x-requested-with")).toBeTruthy();
    });

    it("lets the caller override it, same as x-correlation-id — this package sets a default, it does not enforce one", async () => {
      const seen: Request[] = [];
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

      await client.conversations.GET("/conversations", { headers: { "x-requested-with": "caller-value" } });

      expect(seen[0]!.headers.get("x-requested-with")).toBe("caller-value");
    });

    it("does not disturb x-correlation-id or x-client-id — all three headers are present together, unmodified from before this story", async () => {
      const seen: Request[] = [];
      const client = createApiClient({ baseUrl: "https://api.example.test", fetch: fakeFetch(seen) });

      await client.conversations.GET("/conversations", {});

      const req = seen[0]!;
      expect(req.headers.get("x-correlation-id")).toMatch(UUID_V4_RE);
      expect(req.headers.get("x-client-id")).toBeTruthy();
      expect(req.headers.get("x-requested-with")).toBe("XMLHttpRequest");
    });
  });
});
