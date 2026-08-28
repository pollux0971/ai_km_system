import { describe, expect, it } from "vitest";
import { createApiClient } from "@ai-km/api-client";
import { createHttpAuthClient } from "./http";

function jsonResponse(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function clientWithFetch(fetchImpl: (input: Request) => Promise<Response>) {
  const api = createApiClient({ baseUrl: "https://api.example.test", fetch: fetchImpl, clientId: "test-client" });
  return createHttpAuthClient(api);
}

const SESSION = {
  userId: "demo-user",
  roles: ["general_user"],
  expiresAt: "2026-09-04T05:12:00.000Z",
  name: "示範使用者",
  email: "demo-user@example.com",
  department: "工程部",
  group: "平台組",
};

describe("createHttpAuthClient", () => {
  describe("login", () => {
    it("returns ok:true with the session body, field-for-field, on a 200 + Set-Cookie response", async () => {
      const client = clientWithFetch(async () =>
        jsonResponse(200, SESSION, { "set-cookie": "ai_km_session=opaque; HttpOnly; SameSite=Lax; Path=/" }),
      );

      const result = await client.login({ username: "demo-user", password: "demo-pass-123" });

      expect(result).toEqual({ ok: true, value: SESSION });
      // The contract never puts the token in the body (it's HttpOnly-cookie-only) — this
      // just confirms the client forwards the body verbatim rather than inventing a strip
      // step that would mask a contract violation if one ever crept in.
      expect("token" in (result.ok ? result.value : {})).toBe(false);
    });

    it("passes a 401 INVALID_CREDENTIALS through with the server's code unchanged (not UNAUTHENTICATED)", async () => {
      const client = clientWithFetch(async () =>
        jsonResponse(401, { code: "INVALID_CREDENTIALS", message: "帳號或密碼不正確。" }),
      );

      const result = await client.login({ username: "demo-user", password: "wrong" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INVALID_CREDENTIALS");
    });

    it("passes a 403 ACCOUNT_DISABLED through with the server's code unchanged", async () => {
      const client = clientWithFetch(async () =>
        jsonResponse(403, { code: "ACCOUNT_DISABLED", message: "此帳號已停用,請聯絡系統管理員。" }),
      );

      const result = await client.login({ username: "disabled", password: "demo-pass-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("ACCOUNT_DISABLED");
    });

    it("passes a 503 SERVICE_UNAVAILABLE through with the server's code unchanged", async () => {
      const client = clientWithFetch(async () =>
        jsonResponse(503, { code: "SERVICE_UNAVAILABLE", message: "認證服務暫時無法使用,請稍後再試。" }),
      );

      const result = await client.login({ username: "demo-user", password: "demo-pass-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("maps a network failure to SERVICE_UNAVAILABLE", async () => {
      const client = clientWithFetch(async () => {
        throw new TypeError("Failed to fetch");
      });

      const result = await client.login({ username: "demo-user", password: "demo-pass-123" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("getSession", () => {
    it("returns ok:true with the session on 200", async () => {
      const client = clientWithFetch(async () => jsonResponse(200, SESSION));

      const result = await client.getSession();

      expect(result).toEqual({ ok: true, value: SESSION });
    });

    it("maps a 401 UNAUTHENTICATED to ok:true, value:null — not signed in is not a failure", async () => {
      const client = clientWithFetch(async () => jsonResponse(401, { code: "UNAUTHENTICATED", message: "請先登入。" }));

      const result = await client.getSession();

      expect(result).toEqual({ ok: true, value: null });
    });

    it("keeps a 500 as ok:false (a real failure), so session-gate shows an error state instead of redirecting to login", async () => {
      const client = clientWithFetch(async () => jsonResponse(500, { code: "INTERNAL_ERROR", message: "系統發生未預期的錯誤。" }));

      const result = await client.getSession();

      expect(result.ok).toBe(false);
    });

    it("maps a network failure to ok:false SERVICE_UNAVAILABLE, distinct from the 401 (logged-out) case", async () => {
      const client = clientWithFetch(async () => {
        throw new TypeError("Failed to fetch");
      });

      const result = await client.getSession();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
    });
  });

  describe("logout", () => {
    it("returns ok:true, value:undefined on a 204 No Content response", async () => {
      const client = clientWithFetch(async () => new Response(null, { status: 204 }));

      const result = await client.logout();

      expect(result).toEqual({ ok: true, value: undefined });
    });

    it("maps a 500 to ok:false with the server's code", async () => {
      const client = clientWithFetch(async () => jsonResponse(500, { code: "INTERNAL_ERROR", message: "系統發生未預期的錯誤。" }));

      const result = await client.logout();

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("INTERNAL_ERROR");
    });
  });
});
