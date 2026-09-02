import { describe, expect, it } from "vitest";
import type { LoadedSpec } from "./load-contracts.js";
import { computeResponseShapeCoverage, declaredJsonTwoXxOperations } from "./response-shape-coverage.js";

function spec(yamlFile: string, paths: Record<string, unknown>): LoadedSpec {
  return { specName: yamlFile.replace(/\.ya?ml$/, ""), yamlFile, document: { paths } };
}

describe("declaredJsonTwoXxOperations", () => {
  it("counts an operation with a JSON 2xx response, and does not count one without", () => {
    const specs = [
      spec("widgets.yaml", {
        "/widgets": {
          get: {
            responses: {
              "200": { content: { "application/json": { schema: { type: "object" } } } },
            },
          },
        },
        "/widgets/{id}": {
          // 204 no body — a real shape in this repo (DELETE .../conversationId,
          // POST .../auth/logout) — must NOT be counted as "declared", since
          // there is no JSON schema on either side to ever compare.
          delete: { responses: { "204": {} } },
        },
      }),
    ];

    expect(declaredJsonTwoXxOperations(specs)).toEqual(["GET /widgets"]);
  });

  it("counts one entry per operation even when it declares two JSON 2xx statuses", () => {
    const specs = [
      spec("widgets.yaml", {
        "/widgets": {
          post: {
            responses: {
              "200": { content: { "application/json": { schema: { type: "object" } } } },
              "201": { content: { "application/json": { schema: { type: "object" } } } },
            },
          },
        },
      }),
    ];

    expect(declaredJsonTwoXxOperations(specs)).toEqual(["POST /widgets"]);
  });

  it("merges operations across multiple loaded specs, sorted", () => {
    const specs = [
      spec("b.yaml", {
        "/b": { get: { responses: { "200": { content: { "application/json": { schema: {} } } } } } },
      }),
      spec("a.yaml", {
        "/a": { get: { responses: { "200": { content: { "application/json": { schema: {} } } } } } },
      }),
    ];

    expect(declaredJsonTwoXxOperations(specs)).toEqual(["GET /a", "GET /b"]);
  });

  // Reverse verification: if this function silently stopped requiring a
  // JSON content type (the same shape of bug the querystring
  // `additionalProperties` normalisation rule in normalize.ts warns about
  // — a rule that's too permissive equates two genuinely different
  // things), a 204/SSE/non-JSON operation would start counting as
  // "declared" and the coverage report's denominator would inflate itself
  // silently. Asserted directly here so that specific regression has a
  // named, failing test rather than relying on eyeballing report output.
  it("a 2xx status with no application/json content is not declared, even though it IS a 2xx", () => {
    const specs = [
      spec("events.yaml", {
        "/events": {
          get: {
            responses: {
              "200": { content: { "text/event-stream": { schema: {} } } },
            },
          },
        },
      }),
    ];

    expect(declaredJsonTwoXxOperations(specs)).toEqual([]);
  });
});

describe("computeResponseShapeCoverage", () => {
  const specs = [
    spec("widgets.yaml", {
      "/widgets": { get: { responses: { "200": { content: { "application/json": { schema: {} } } } } } },
      "/widgets/{id}": { get: { responses: { "200": { content: { "application/json": { schema: {} } } } } } },
      "/gadgets": { post: { responses: { "201": { content: { "application/json": { schema: {} } } } } } },
    }),
  ];

  it("splits declared into exercised + notCovered, never dropping a declared route silently", () => {
    const coverage = computeResponseShapeCoverage(specs, new Set(["GET /widgets"]));

    expect(coverage.declared).toEqual(["GET /widgets", "GET /widgets/{id}", "POST /gadgets"]);
    expect(coverage.exercised).toEqual(["GET /widgets"]);
    // The decisive assertion: the two NOT exercised routes are named, not
    // just subtracted into a count. A regression that hid one of these
    // (e.g. by accidentally treating "not in exercisedKeys" as "covered")
    // would shrink this array without changing `declared.length`.
    expect(coverage.notCovered).toEqual(["GET /widgets/{id}", "POST /gadgets"]);
  });

  it("notCovered is empty when every declared route was exercised", () => {
    const coverage = computeResponseShapeCoverage(specs, new Set(["GET /widgets", "GET /widgets/{id}", "POST /gadgets"]));
    expect(coverage.notCovered).toEqual([]);
    expect(coverage.exercised).toEqual(coverage.declared);
  });
});
