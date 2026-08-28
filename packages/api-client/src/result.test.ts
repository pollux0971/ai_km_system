import { describe, expect, expectTypeOf, it } from "vitest";
import { toResult } from "./result";
import type { components } from "./generated/core";

function response(status: number): Response {
  return new Response(null, { status });
}

describe("toResult", () => {
  it("returns ok:true with the typed data on a 2xx response", async () => {
    const data = { page: 1, pageSize: 20, total: 0 } satisfies components["schemas"]["Pagination"];

    const result = await toResult(Promise.resolve({ data, error: undefined, response: response(200) }));

    expect(result).toEqual({ ok: true, value: data });
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<typeof data>();
    }
  });

  it("maps a 404 Error-envelope body to ok:false with the server's machine-readable code", async () => {
    const error = { code: "NOT_FOUND", message: "conversation not found" };

    const result = await toResult(Promise.resolve({ data: undefined, error, response: response(404) }));

    expect(result).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "conversation not found", details: undefined },
    });
  });

  it("preserves the Error envelope's optional details field", async () => {
    const error = { code: "VALIDATION_ERROR", message: "bad input", details: { field: "page" } };

    const result = await toResult(Promise.resolve({ data: undefined, error, response: response(400) }));

    expect(result).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "bad input", details: { field: "page" } },
    });
  });

  it("normalizes a non-JSON error body (openapi-fetch rejects while parsing) to SERVICE_UNAVAILABLE", async () => {
    const result = await toResult(Promise.reject(new SyntaxError("Unexpected token in JSON")));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("normalizes a thrown network error to SERVICE_UNAVAILABLE", async () => {
    const result = await toResult(Promise.reject(new TypeError("Failed to fetch")));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("normalizes any 401 to UNAUTHENTICATED regardless of the response body", async () => {
    const result = await toResult(Promise.resolve({ data: undefined, error: undefined, response: response(401) }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("still normalizes to UNAUTHENTICATED on 401 even when the body carries a different code", async () => {
    const error = { code: "SESSION_EXPIRED", message: "your session expired" };

    const result = await toResult(Promise.resolve({ data: undefined, error, response: response(401) }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("falls back to SERVICE_UNAVAILABLE for a non-2xx response whose error body doesn't match the Error envelope", async () => {
    const result = await toResult(
      Promise.resolve({ data: undefined, error: { unexpected: "shape" }, response: response(500) }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
