import { describe, expect, it } from "vitest";
import { diffResponseInstance } from "./response-instance-diff.js";

const CONVERSATION_SCHEMA = {
  type: "object",
  required: ["id", "title", "archived"],
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    title: { type: "string" },
    archived: { type: "boolean" },
  },
} as const;

describe("diffResponseInstance", () => {
  it("reports neither extra nor missing when the instance matches the schema exactly", () => {
    const result = diffResponseInstance(CONVERSATION_SCHEMA, { id: "1", title: "t", archived: false });
    expect(result).toEqual({ extra: [], missing: [] });
  });

  it("reports a field present on the instance but not declared in the schema as extra", () => {
    const result = diffResponseInstance(CONVERSATION_SCHEMA, {
      id: "1",
      title: "t",
      archived: false,
      ownerKey: "leaked",
    });
    expect(result.extra).toEqual(["$.ownerKey"]);
    expect(result.missing).toEqual([]);
  });

  it("reports a schema-required field absent from the instance as missing", () => {
    const result = diffResponseInstance(CONVERSATION_SCHEMA, { id: "1", title: "t" });
    expect(result.missing).toEqual(["$.archived"]);
    expect(result.extra).toEqual([]);
  });

  it("treats a required field explicitly set to undefined the same as absent", () => {
    const result = diffResponseInstance(CONVERSATION_SCHEMA, { id: "1", title: "t", archived: undefined });
    expect(result.missing).toEqual(["$.archived"]);
  });

  it("does not report an optional (non-required) field's absence as missing", () => {
    const schema = {
      type: "object",
      required: ["id"],
      properties: { id: { type: "string" }, nickname: { type: "string" } },
    };
    const result = diffResponseInstance(schema, { id: "1" });
    expect(result).toEqual({ extra: [], missing: [] });
  });

  it("recurses into a nested required object property", () => {
    const schema = {
      type: "object",
      required: ["user"],
      properties: {
        user: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    };
    const result = diffResponseInstance(schema, { user: { id: "1", secret: "leaked" } });
    expect(result.extra).toEqual(["$.user.secret"]);
  });

  it("recurses into every array item and unions the findings by path", () => {
    const schema = {
      type: "array",
      items: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    };
    const result = diffResponseInstance(schema, [{ id: "1" }, { id: "2", extraField: true }, { notId: "x" }]);
    expect(result.extra).toEqual(["$[].extraField", "$[].notId"]);
    expect(result.missing).toEqual(["$[].id"]);
  });

  it("does not descend into an additionalProperties-only map (no fixed field list to compare)", () => {
    const schema = {
      type: "object",
      required: ["citationFeedback"],
      properties: {
        citationFeedback: {
          type: "object",
          additionalProperties: { type: "string", enum: ["OK", "NG"] },
        },
      },
    };
    const result = diffResponseInstance(schema, { citationFeedback: { "1": "OK", "2": "NG" } });
    expect(result).toEqual({ extra: [], missing: [] });
  });

  it("stops at a node with no schema to compare against (undefined/boolean schema) without throwing", () => {
    const result = diffResponseInstance(undefined, { anything: true });
    expect(result).toEqual({ extra: [], missing: [] });
  });

  it("does not report a type mismatch (instance not an object where schema expects one) as extra/missing", () => {
    const result = diffResponseInstance(CONVERSATION_SCHEMA, "not-an-object");
    expect(result).toEqual({ extra: [], missing: [] });
  });
});
