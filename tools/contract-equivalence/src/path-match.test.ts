import { describe, expect, it } from "vitest";
import { fastifyPathToOpenApiPath, routeKeyOf, routeKeyToString, stripApiPrefix } from "./path-match.js";

describe("fastifyPathToOpenApiPath", () => {
  it("converts :id segments to {id}", () => {
    expect(fastifyPathToOpenApiPath("/v1/conversations/:conversationId/messages/:messageId")).toBe(
      "/v1/conversations/{conversationId}/messages/{messageId}",
    );
  });

  it("is idempotent on an already-{id}-style path", () => {
    expect(fastifyPathToOpenApiPath("/conversations/{conversationId}")).toBe("/conversations/{conversationId}");
  });

  it("preserves a parameter name that does not match the contract's — a real mismatch must NOT silently match", () => {
    expect(fastifyPathToOpenApiPath("/conversations/:msgId")).toBe("/conversations/{msgId}");
    expect(fastifyPathToOpenApiPath("/conversations/:msgId")).not.toBe("/conversations/{messageId}");
  });
});

describe("stripApiPrefix", () => {
  it("strips exactly one leading /v1 segment", () => {
    expect(stripApiPrefix("/v1/conversations")).toBe("/conversations");
  });

  it("leaves a path with no /v1 prefix untouched", () => {
    expect(stripApiPrefix("/conversations")).toBe("/conversations");
  });

  it("does not strip /v1 as a substring elsewhere (e.g. /v10/x)", () => {
    expect(stripApiPrefix("/v10/x")).toBe("/v10/x");
  });

  it("reduces bare /v1 to /", () => {
    expect(stripApiPrefix("/v1")).toBe("/");
  });
});

describe("routeKeyOf / routeKeyToString", () => {
  it("combines prefix-stripping, param conversion and method casing into one comparable key", () => {
    const key = routeKeyOf("/v1/conversations/:conversationId", "get");
    expect(key).toEqual({ path: "/conversations/{conversationId}", method: "get" });
    expect(routeKeyToString(key)).toBe("GET /conversations/{conversationId}");
  });
});
