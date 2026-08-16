// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { CORRELATION_ID_HEADER, middleware } from "./middleware";

describe("middleware correlation id", () => {
  it("generates a correlation id when none is present on the request", () => {
    const request = new NextRequest("http://localhost:3001/");

    const response = middleware(request);

    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(id).toBeTruthy();
    expect(request.headers.get(CORRELATION_ID_HEADER)).toBeNull();
  });

  it("preserves an existing correlation id instead of overwriting it", () => {
    const request = new NextRequest("http://localhost:3001/", {
      headers: { [CORRELATION_ID_HEADER]: "upstream-fixed-id" },
    });

    const response = middleware(request);

    expect(response.headers.get(CORRELATION_ID_HEADER)).toBe("upstream-fixed-id");
  });

  it("generates a fresh id (not reused) for an empty header value", () => {
    const request = new NextRequest("http://localhost:3001/", {
      headers: { [CORRELATION_ID_HEADER]: "   " },
    });

    const response = middleware(request);

    const id = response.headers.get(CORRELATION_ID_HEADER);
    expect(id).toBeTruthy();
    expect(id?.trim()).not.toBe("");
  });
});
