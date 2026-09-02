/**
 * Flattens every loaded contract's `paths:` object into one lookup keyed by
 * `routeKeyToString` (`"METHOD /path"`), each entry carrying the operation
 * plus its path-item-level `parameters:` already merged in (OpenAPI 3.1
 * §4.8.10 — see `synthesize.ts`'s `mergeParameters`).
 */
import type { JsonValue, LoadedSpec } from "./load-contracts.js";
import { mergeParameters, type OpenApiParameter } from "./synthesize.js";
import { routeKeyToString } from "./path-match.js";

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export interface YamlOperation {
  readonly specName: string;
  readonly yamlFile: string;
  readonly path: string; // OpenAPI-style, e.g. "/conversations/{conversationId}"
  readonly method: string; // lowercase
  readonly operationId?: string;
  readonly parameters: readonly OpenApiParameter[]; // path-item + operation-level, merged
  readonly requestBody?: JsonValue;
  readonly responses?: Record<string, JsonValue>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Every operation across every loaded spec, keyed `"METHOD /path"`. `core.yaml` (`paths: {}`) contributes nothing. */
export function buildYamlIndex(specs: readonly LoadedSpec[]): Map<string, YamlOperation> {
  const index = new Map<string, YamlOperation>();
  for (const spec of specs) {
    const paths = spec.document.paths;
    if (!isRecord(paths)) continue;
    for (const [pathTemplate, pathItemRaw] of Object.entries(paths)) {
      if (!isRecord(pathItemRaw)) continue;
      const pathItemParams = (Array.isArray(pathItemRaw.parameters) ? pathItemRaw.parameters : []) as OpenApiParameter[];
      for (const method of HTTP_METHODS) {
        const operationRaw = pathItemRaw[method];
        if (!isRecord(operationRaw)) continue;
        const operationParams = (Array.isArray(operationRaw.parameters) ? operationRaw.parameters : []) as OpenApiParameter[];
        const operation: YamlOperation = {
          specName: spec.specName,
          yamlFile: spec.yamlFile,
          path: pathTemplate,
          method,
          ...(typeof operationRaw.operationId === "string" ? { operationId: operationRaw.operationId } : {}),
          parameters: mergeParameters(pathItemParams, operationParams),
          ...(isRecord(operationRaw.requestBody) ? { requestBody: operationRaw.requestBody as JsonValue } : {}),
          ...(isRecord(operationRaw.responses) ? { responses: operationRaw.responses as Record<string, JsonValue> } : {}),
        };
        index.set(routeKeyToString({ path: pathTemplate, method }), operation);
      }
    }
  }
  return index;
}

/** `application/json` request body schema for one operation, or `undefined` (no body, or a non-JSON body like `transcriptions.yaml`'s `multipart/form-data`). */
export function requestBodyJsonSchema(operation: YamlOperation): JsonValue | undefined {
  const body = operation.requestBody;
  if (!isRecord(body)) return undefined;
  const content = body.content;
  if (!isRecord(content)) return undefined;
  const json = content["application/json"];
  if (!isRecord(json)) return undefined;
  return json.schema as JsonValue | undefined;
}

/** `application/json` response schema for one status code, or `undefined`. */
export function responseJsonSchema(operation: YamlOperation, status: string): JsonValue | undefined {
  const response = operation.responses?.[status];
  if (!isRecord(response)) return undefined;
  const content = response.content;
  if (!isRecord(content)) return undefined;
  const json = content["application/json"];
  if (!isRecord(json)) return undefined;
  return json.schema as JsonValue | undefined;
}

export function twoXxStatuses(operation: YamlOperation): string[] {
  return Object.keys(operation.responses ?? {}).filter((s) => /^2\d\d$/.test(s));
}
