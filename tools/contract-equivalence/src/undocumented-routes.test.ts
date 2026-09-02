import { describe, expect, it } from "vitest";
import type { BuildReportResult, RouteReport } from "./build-report.js";
import { checkUndocumentedRoutes, undocumentedRoutes } from "./undocumented-routes.js";
import { UNDOCUMENTED_ROUTE_ALLOWLIST } from "./undocumented-route-allowlist.js";

/** A route with no matching yaml operation at all — build-report.ts's `if (!operation)` branch. */
function noYamlOperation(key: string): RouteReport {
  return {
    key,
    status: "ABSENT",
    note: `registered route has no yaml operation at ${key} in any loaded contract`,
    requestFields: [],
    responseFields: [],
  };
}

/**
 * A route that DID match a yaml operation (has an operationId) but whose
 * body field is ABSENT (e.g. the contract declares a body the route has
 * no runtime schema for). This is a real, different finding this story
 * must NOT treat as "undocumented" — it already shows up as an ABSENT
 * `requestFields` entry visible in the printed report today.
 */
function matchedButAbsentField(key: string): RouteReport {
  return {
    key,
    status: "ABSENT",
    operationId: "someOperation",
    yamlFile: "core.yaml",
    requestFields: [{ field: "body", status: "ABSENT", note: "contract declares this; the route has no runtime schema for it" }],
    responseFields: [],
  };
}

/** A route that matched and diverged — must never be treated as undocumented, and must never be exempt-able (see this story's landing constraint). */
function diverged(key: string): RouteReport {
  return {
    key,
    status: "DIVERGES",
    operationId: "someOtherOperation",
    yamlFile: "core.yaml",
    requestFields: [{ field: "body", status: "DIVERGES", diff: [] }],
    responseFields: [],
  };
}

function resultOf(routes: RouteReport[], unmatchedOperations: RouteReport[] = []): BuildReportResult {
  return { routes, unmatchedOperations };
}

describe("undocumentedRoutes (E04-S078)", () => {
  it("picks out ONLY routes with status ABSENT and no operationId", () => {
    const found = undocumentedRoutes(
      resultOf([
        noYamlOperation("GET /v1/health"),
        matchedButAbsentField("GET /v1/matched-absent-field"),
        diverged("POST /v1/diverged"),
      ]),
    );
    expect(found.map((r) => r.key)).toEqual(["GET /v1/health"]);
  });

  it("does NOT pick up the reverse direction (a yaml operation with no matching route)", () => {
    // A yaml-side ABSENT entry lives in `unmatchedOperations`, always
    // carries an operationId, and must never be conflated with this
    // story's route-side case even though both are status "ABSENT".
    const yamlSideAbsent: RouteReport = {
      key: "GET /v1/some-declared-but-unimplemented-route",
      status: "ABSENT",
      operationId: "declaredOnly",
      yamlFile: "core.yaml",
      note: "yaml declares this operation; no registered route matches it",
      requestFields: [],
      responseFields: [],
    };
    const found = undocumentedRoutes(resultOf([], [yamlSideAbsent]));
    expect(found).toEqual([]);
  });
});

describe("checkUndocumentedRoutes (E04-S078)", () => {
  it("an undocumented route covered by the exempt allowlist is not a violation", () => {
    const result = resultOf([noYamlOperation("GET /v1/health")]);
    const check = checkUndocumentedRoutes(result);
    expect(check.undocumented.map((r) => r.key)).toEqual(["GET /v1/health"]);
    expect(check.violations).toEqual([]);
    expect(check.exemptCount).toBe(UNDOCUMENTED_ROUTE_ALLOWLIST.length);
  });

  it("REVERSE VERIFICATION 2 target: a brand-new undocumented route NOT on the allowlist is a violation naming that route", () => {
    const result = resultOf([noYamlOperation("GET /v1/health"), noYamlOperation("POST /v1/totally-new-route")]);
    const check = checkUndocumentedRoutes(result);
    expect(check.violations.map((r) => r.key)).toEqual(["POST /v1/totally-new-route"]);
  });

  it("a matched-but-field-ABSENT route and a DIVERGES route never count as undocumented or become violations", () => {
    const result = resultOf([matchedButAbsentField("GET /v1/matched-absent-field"), diverged("POST /v1/diverged")]);
    const check = checkUndocumentedRoutes(result);
    expect(check.undocumented).toEqual([]);
    expect(check.violations).toEqual([]);
  });
});

describe("UNDOCUMENTED_ROUTE_ALLOWLIST content (E04-S078)", () => {
  it("every entry carries a non-empty reason, escalation and unlock", () => {
    for (const entry of UNDOCUMENTED_ROUTE_ALLOWLIST) {
      expect(entry.route.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(entry.escalation.length).toBeGreaterThan(0);
      expect(entry.unlock.length).toBeGreaterThan(0);
    }
  });

  it("is seeded with exactly GET /v1/health, pending the user's decision", () => {
    expect(UNDOCUMENTED_ROUTE_ALLOWLIST.map((e) => e.route)).toEqual(["GET /v1/health"]);
    const entry = UNDOCUMENTED_ROUTE_ALLOWLIST[0];
    if (!entry) throw new Error("expected UNDOCUMENTED_ROUTE_ALLOWLIST[0] to exist");
    expect(entry.reason).toContain("pending");
    expect(entry.escalation).toContain("E04-S078");
  });
});
