/**
 * Orchestrates the whole L2-EQ comparison: matches every collected Fastify
 * route to its OpenAPI operation (by path+method, both normalised — see
 * `path-match.ts`), diffs body/querystring/params/response schemas (see
 * `normalize.ts`), and produces one `RouteReport` per route plus one entry
 * per yaml operation that has no matching route.
 */
import type { LoadedSpec } from "./load-contracts.js";
import type { CollectedRoute } from "./collect-routes.js";
import { isReportableRoute } from "./collect-routes.js";
import { routeKeyOf, routeKeyToString } from "./path-match.js";
import { buildYamlIndex, requestBodyJsonSchema, responseJsonSchema, twoXxStatuses, type YamlOperation } from "./yaml-index.js";
import { synthesizeParamsSchema } from "./synthesize.js";
import { diffSchemas, type DiffEntry } from "./normalize.js";

export type FieldStatus = "MATCH" | "DIVERGES" | "ABSENT" | "N/A";

export interface FieldResult {
  readonly field: "body" | "querystring" | "params" | `response:${string}`;
  readonly status: FieldStatus;
  readonly diff?: DiffEntry[];
  readonly note?: string;
}

export type RouteStatus = "MATCH" | "DIVERGES" | "ABSENT";

export interface RouteReport {
  readonly key: string; // "METHOD /path"
  /** Driven ONLY by `requestFields` (body/querystring/params) — see module doc. */
  readonly status: RouteStatus;
  readonly operationId?: string;
  readonly yamlFile?: string;
  readonly requestFields: FieldResult[];
  /**
   * `response:<status>` findings — computed, but NEVER folded into
   * `status`. Every route in this app registers zero Fastify `response`
   * schemas (verified empirically — see README "Stated limitations"):
   * response-body compliance here is enforced by
   * `apps/api/src/testing/contract.ts`'s `expectResponseMatchesContract` at
   * TEST time, not by a runtime validator L2-EQ could compare against. If
   * `responseFields` counted toward `status`, every single route would
   * read ABSENT regardless of whether its actual, load-bearing
   * body/querystring transcription matches the contract — exactly the
   * "everything is red so nothing is red" failure mode a status field
   * exists to prevent. Reported for visibility (a future route that DOES
   * add one gets compared for real), not for the primary verdict.
   */
  readonly responseFields: FieldResult[];
  readonly note?: string;
}

function worstOf(fields: readonly FieldResult[]): RouteStatus {
  if (fields.some((f) => f.status === "DIVERGES")) return "DIVERGES";
  if (fields.some((f) => f.status === "ABSENT")) return "ABSENT";
  return "MATCH";
}

function compareField(field: FieldResult["field"], contractSide: unknown, runtimeSide: unknown): FieldResult {
  const contractPresent = contractSide !== undefined;
  const runtimePresent = runtimeSide !== undefined;
  if (!contractPresent && !runtimePresent) return { field, status: "N/A" };
  if (contractPresent && !runtimePresent) {
    return { field, status: "ABSENT", note: "contract declares this; the route has no runtime schema for it" };
  }
  if (!contractPresent && runtimePresent) {
    return { field, status: "ABSENT", note: "the route has a runtime schema for this; the contract declares none" };
  }
  const diff = diffSchemas(contractSide, runtimeSide);
  if (diff.length === 0) return { field, status: "MATCH" };
  return { field, status: "DIVERGES", diff };
}

export interface BuildReportResult {
  readonly routes: RouteReport[];
  /** Yaml operations with no matching registered route ("this direction" of ABSENT). */
  readonly unmatchedOperations: RouteReport[];
}

export function buildReport(specs: readonly LoadedSpec[], collected: readonly CollectedRoute[]): BuildReportResult {
  const yamlIndex = buildYamlIndex(specs);
  const matchedYamlKeys = new Set<string>();

  const routes: RouteReport[] = [];

  for (const route of collected) {
    if (!isReportableRoute(route)) continue;
    const key = routeKeyOf(route.url, route.method);
    const keyString = routeKeyToString(key);
    const operation = yamlIndex.get(keyString);

    if (!operation) {
      routes.push({
        key: `${route.method} ${route.url}`,
        status: "ABSENT",
        note: `registered route has no yaml operation at ${keyString} in any loaded contract`,
        requestFields: [],
        responseFields: [],
      });
      continue;
    }
    matchedYamlKeys.add(keyString);
    routes.push(buildMatchedRouteReport(route, operation));
  }

  const unmatchedOperations: RouteReport[] = [];
  for (const [keyString, operation] of yamlIndex) {
    if (matchedYamlKeys.has(keyString)) continue;
    unmatchedOperations.push({
      key: keyString,
      status: "ABSENT",
      operationId: operation.operationId,
      yamlFile: operation.yamlFile,
      note: "yaml declares this operation; no registered route matches it",
      requestFields: [],
      responseFields: [],
    });
  }

  return { routes, unmatchedOperations };
}

function buildMatchedRouteReport(route: CollectedRoute, operation: YamlOperation): RouteReport {
  const requestFields: FieldResult[] = [];

  const contractBody = requestBodyJsonSchema(operation);
  // A non-JSON body (transcriptions.yaml's multipart/form-data) is neither
  // MATCH, DIVERGES nor a gap — there is no JSON Schema on either side to
  // compare, by design. `undefined === undefined` already resolves this to
  // "N/A" via compareField, so the multipart case is not distinguished
  // from "no body at all": both correctly produce N/A.
  requestFields.push(compareField("body", contractBody, route.schema?.body));

  const contractQuery = synthesizeParamsSchema(operation.parameters, "query");
  requestFields.push(compareField("querystring", contractQuery, route.schema?.querystring));

  const contractParams = synthesizeParamsSchema(operation.parameters, "path");
  requestFields.push(compareField("params", contractParams, route.schema?.params));

  // Response: 2xx only (see normalize.ts module doc + README "Stated
  // limitations" for why non-2xx/Error-envelope comparison is out of scope
  // for this run — zero routes in this repo register a runtime response
  // schema today, so there is nothing to diff a rule against yet).
  // Deliberately excluded from `status` — see RouteReport.responseFields doc.
  const responseFields: FieldResult[] = [];
  for (const status of twoXxStatuses(operation)) {
    const contractResponse = responseJsonSchema(operation, status);
    const runtimeResponse = route.schema?.response?.[status];
    const result = compareField(`response:${status}`, contractResponse, runtimeResponse);
    if (result.status !== "N/A") responseFields.push(result);
  }

  const reportableRequestFields = requestFields.filter((f) => f.status !== "N/A");
  return {
    key: `${route.method} ${route.url}`,
    status: worstOf(reportableRequestFields),
    operationId: operation.operationId,
    yamlFile: operation.yamlFile,
    requestFields: reportableRequestFields,
    responseFields,
  };
}
