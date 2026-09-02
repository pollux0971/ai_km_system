import { describe, expect, it } from "vitest";
import { diffSchemas, normalizeSchema } from "./normalize.js";

describe("normalizeSchema — rule 1 (annotation keys stripped)", () => {
  it("strips description/title/examples/example and x-* recursively", () => {
    const input = {
      type: "object",
      description: "prose",
      "x-required-roles": ["auditor"],
      properties: {
        name: { type: "string", title: "Name", examples: ["a"], example: "a" },
      },
    };
    expect(normalizeSchema(input)).toEqual({
      type: "object",
      properties: { name: { type: "string" } },
    });
  });
});

describe("normalizeSchema — rules 2/3 (required/enum are sets, not sequences)", () => {
  it("sorts required so declaration order never causes a false DIVERGES", () => {
    const a = normalizeSchema({ required: ["b", "a"] });
    const b = normalizeSchema({ required: ["a", "b"] });
    expect(a).toEqual(b);
  });

  it("sorts enum the same way", () => {
    const a = normalizeSchema({ enum: ["NG", "OK"] });
    const b = normalizeSchema({ enum: ["OK", "NG"] });
    expect(a).toEqual(b);
  });

  it("does NOT silently equate two enums with different MEMBERS, only different order", () => {
    const diffs = diffSchemas({ enum: ["OK", "NG"] }, { enum: ["OK"] });
    expect(diffs).not.toEqual([]);
  });
});

describe("normalizeSchema — the one named format exception", () => {
  it("strips format: password specifically (ajv-formats defines it as the literal `true`)", () => {
    const diffs = diffSchemas(
      { type: "string", format: "password" },
      { type: "string" },
    );
    expect(diffs).toEqual([]);
  });

  it("does NOT strip any other format value — a real format mismatch still DIVERGES", () => {
    const diffs = diffSchemas(
      { type: "string", format: "uuid" },
      { type: "string", format: "date-time" },
    );
    expect(diffs).toEqual([
      {
        path: "(root).format",
        contract: { present: true, value: "uuid" },
        runtime: { present: true, value: "date-time" },
      },
    ]);
  });

  it("still reports a route that dropped format entirely for a non-password format", () => {
    const diffs = diffSchemas({ type: "string", format: "uuid" }, { type: "string" });
    expect(diffs).toEqual([
      {
        path: "(root).format",
        contract: { present: true, value: "uuid" },
        runtime: { present: false },
      },
    ]);
  });
});

describe("diffSchemas — rule 4 (additionalProperties, querystring-shaped asymmetry)", () => {
  it("contract omitting additionalProperties + runtime declaring false is NOT a divergence", () => {
    const diffs = diffSchemas(
      { type: "object", properties: { q: { type: "string" } } },
      { type: "object", properties: { q: { type: "string" } }, additionalProperties: false },
    );
    expect(diffs).toEqual([]);
  });

  it("contract omitting additionalProperties + runtime declaring TRUE is still compared for real (not the normalised direction)", () => {
    const diffs = diffSchemas(
      { type: "object", properties: {} },
      { type: "object", properties: {}, additionalProperties: true },
    );
    expect(diffs).toEqual([
      {
        path: "(root).additionalProperties",
        contract: { present: false },
        runtime: { present: true, value: true },
      },
    ]);
  });

  it("a body schema where BOTH sides declare additionalProperties is compared literally — a runtime that drops false is a real gap", () => {
    const diffs = diffSchemas(
      { type: "object", additionalProperties: false, properties: {} },
      { type: "object", properties: {} },
    );
    expect(diffs).toEqual([
      {
        path: "(root).additionalProperties",
        contract: { present: true, value: false },
        runtime: { present: false },
      },
    ]);
  });
});

describe("diffSchemas — default is NEVER normalised away", () => {
  it("flags a runtime-only default as a real, reportable divergence", () => {
    const diffs = diffSchemas(
      { type: "integer", minimum: 1 },
      { type: "integer", minimum: 1, default: 7 },
    );
    expect(diffs).toEqual([
      {
        path: "(root).default",
        contract: { present: false },
        runtime: { present: true, value: 7 },
      },
    ]);
  });

  it("still catches a route silently changing a contract-pinned default (the exact drift this story exists to catch)", () => {
    const diffs = diffSchemas(
      { type: "integer", default: 20 },
      { type: "integer", default: 50 },
    );
    expect(diffs).toEqual([
      {
        path: "(root).default",
        contract: { present: true, value: 20 },
        runtime: { present: true, value: 50 },
      },
    ]);
  });
});

describe("diffSchemas — a faithful, real transcription (regression guard)", () => {
  it("matches a body schema equivalent to conversations.yaml's CreateRevisionRequest", () => {
    const contract = {
      type: "object",
      required: ["content"],
      additionalProperties: false,
      properties: {
        content: { type: "string", minLength: 1, maxLength: 20000 },
        state: {
          type: "string",
          description: "irrelevant prose",
          enum: ["ANSWERED", "PARTIAL", "NO_EVIDENCE", "ERROR", "PERMISSION_DENIED", "SOURCE_UNAVAILABLE"],
        },
      },
    };
    const runtime = {
      type: "object",
      additionalProperties: false,
      required: ["content"],
      properties: {
        content: { type: "string", minLength: 1, maxLength: 20000 },
        state: {
          type: "string",
          enum: ["ANSWERED", "PARTIAL", "NO_EVIDENCE", "ERROR", "PERMISSION_DENIED", "SOURCE_UNAVAILABLE"],
        },
      },
    };
    expect(diffSchemas(contract, runtime)).toEqual([]);
  });

  it("catches a mutated maxLength (this is what the mutate.mjs reverse verification exercises against the real route file)", () => {
    const contract = { type: "object", properties: { content: { type: "string", maxLength: 20000 } } };
    const mutatedRuntime = { type: "object", properties: { content: { type: "string", maxLength: 200 } } };
    expect(diffSchemas(contract, mutatedRuntime)).toEqual([
      {
        path: "(root).properties.content.maxLength",
        contract: { present: true, value: 20000 },
        runtime: { present: true, value: 200 },
      },
    ]);
  });
});
