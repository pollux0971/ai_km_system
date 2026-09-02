import { describe, expect, it } from "vitest";
import { mergeParameters, synthesizeParamsSchema } from "./synthesize.js";

describe("mergeParameters", () => {
  it("concatenates path-item-level and operation-level parameters", () => {
    const pathItem = [{ name: "conversationId", in: "path" as const, required: true, schema: { type: "string" } }];
    const operation = [{ name: "page", in: "query" as const, schema: { type: "integer" } }];
    expect(mergeParameters(pathItem, operation)).toHaveLength(2);
  });

  it("lets an operation-level parameter override a path-item one with the same name+in", () => {
    const pathItem = [{ name: "page", in: "query" as const, schema: { type: "integer", minimum: 1 } }];
    const operation = [{ name: "page", in: "query" as const, schema: { type: "integer", minimum: 5 } }];
    const merged = mergeParameters(pathItem, operation);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.schema).toEqual({ type: "integer", minimum: 5 });
  });
});

describe("synthesizeParamsSchema", () => {
  it("builds a Fastify-shaped querystring schema from query parameters, with no additionalProperties key", () => {
    const params = [
      { name: "page", in: "query" as const, required: false, schema: { type: "integer", minimum: 1, default: 1 } },
      { name: "q", in: "query" as const, required: false, schema: { type: "string" } },
    ];
    expect(synthesizeParamsSchema(params, "query")).toEqual({
      type: "object",
      properties: {
        page: { type: "integer", minimum: 1, default: 1 },
        q: { type: "string" },
      },
    });
  });

  it("includes required names only for parameters actually marked required", () => {
    const params = [
      { name: "date", in: "query" as const, required: true, schema: { type: "string", format: "date" } },
    ];
    expect(synthesizeParamsSchema(params, "query")).toEqual({
      type: "object",
      properties: { date: { type: "string", format: "date" } },
      required: ["date"],
    });
  });

  it("returns undefined when no parameter uses the requested location", () => {
    const params = [{ name: "conversationId", in: "path" as const, required: true, schema: { type: "string" } }];
    expect(synthesizeParamsSchema(params, "query")).toBeUndefined();
  });

  it("separates path parameters from query parameters", () => {
    const params = [
      { name: "conversationId", in: "path" as const, required: true, schema: { type: "string" } },
      { name: "page", in: "query" as const, schema: { type: "integer" } },
    ];
    expect(synthesizeParamsSchema(params, "path")).toEqual({
      type: "object",
      properties: { conversationId: { type: "string" } },
      required: ["conversationId"],
    });
  });
});
