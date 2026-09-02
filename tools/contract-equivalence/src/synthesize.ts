/**
 * Turns an OpenAPI operation's `parameters:` (a flat array of
 * `{name, in, required, schema}` objects — the only place this repo's
 * contracts declare querystring/path shape, since none of them has a
 * named `components.schemas` component a querystring could `$ref`) into
 * the same JSON-Schema-object shape every route in this repo hand-writes
 * for `schema.querystring` / `schema.params`:
 * `{type: "object", properties: {...}, required: [...]}`.
 *
 * Deliberately produces NO `additionalProperties` key — OpenAPI's
 * `parameters:` list has no field meaning "and nothing else"; that
 * asymmetry against the runtime side (which always writes
 * `additionalProperties: false`) is normalised in `normalize.ts` rule 4,
 * not here — this module's job is only to state faithfully what the
 * contract says, nothing more.
 */
import type { JsonValue } from "./load-contracts.js";

export interface OpenApiParameter {
  readonly name: string;
  readonly in: "query" | "path" | "header" | "cookie";
  readonly required?: boolean;
  readonly schema?: JsonValue;
}

/**
 * Path-item-level `parameters:` apply to every operation on that path;
 * operation-level `parameters:` are added to (and, for the same
 * `name`+`in`, override) them — OpenAPI 3.1 §4.8.10.
 */
export function mergeParameters(
  pathItemParams: readonly OpenApiParameter[],
  operationParams: readonly OpenApiParameter[],
): OpenApiParameter[] {
  const byKey = new Map<string, OpenApiParameter>();
  for (const p of pathItemParams) byKey.set(`${p.in}:${p.name}`, p);
  for (const p of operationParams) byKey.set(`${p.in}:${p.name}`, p);
  return [...byKey.values()];
}

/** Synthesises a Fastify-shaped JSON Schema for one `in:` location, or `undefined` if no parameter uses it. */
export function synthesizeParamsSchema(
  parameters: readonly OpenApiParameter[],
  location: "query" | "path",
): JsonValue | undefined {
  const matching = parameters.filter((p) => p.in === location);
  if (matching.length === 0) return undefined;

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of matching) {
    properties[p.name] = p.schema ?? {};
    if (p.required) required.push(p.name);
  }

  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}
