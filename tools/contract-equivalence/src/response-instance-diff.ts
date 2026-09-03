/**
 * E04-S079 — instance-vs-schema response diff.
 *
 * `build-report.ts`'s existing `response:<status>` field compares two
 * SCHEMAS (the contract's declared 2xx shape vs whatever Fastify `schema.
 * response` a route registered) and — per E04-S073's own finding — every
 * route in this app registers zero runtime response schemas, so that
 * comparison can only ever read ABSENT. There is nothing declarative on the
 * runtime side to diff a schema against.
 *
 * This module answers a different, narrower question: given the contract's
 * declared 2xx JSON Schema and one REAL response body a live route actually
 * returned (captured by `check-response-shapes.live.test.ts` via
 * `app.inject()` against the real `apps/api` server), which top-level (and
 * nested-object/array) FIELDS does the instance carry that the schema does
 * not document (a potential leak), and which fields does the schema require
 * that the instance does not carry (a potential broken consumer)?
 *
 * WHAT THIS DELIBERATELY DOES NOT DO (stated, not hidden):
 *
 *   - It does not validate TYPES, formats, enums, or any other JSON Schema
 *     keyword — only property PRESENCE at each level it recurses into. A
 *     field present on both sides but holding a `string` where the contract
 *     says `integer` is invisible to this function. `apps/api/src/testing/
 *     contract.ts`'s `expectResponseMatchesContract` (ajv-based, already
 *     wired into several route test files) is the tool for that job; this
 *     one exists because that one only runs where a test author remembered
 *     to call it, and says nothing about UNDOCUMENTED extra fields when the
 *     contract's `additionalProperties` is anything other than `false`
 *     (every 2xx object schema in this repo IS `additionalProperties:
 *     false`, so ajv would in fact reject an extra field too — but a
 *     schema-shape reader that answers "extra/missing, by name" for a
 *     report table is still a different, more direct question than "did
 *     validation pass").
 *   - It does not descend into a schema's `additionalProperties` map value
 *     (e.g. `Message.citationFeedback: {additionalProperties: {$ref:
 *     AnswerFeedbackVerdict}}`) — a map's keys are data (citation marker
 *     ids), not a fixed field list, so "extra/missing field" has no meaning
 *     there. The map's own presence/absence as a whole IS still checked at
 *     its parent level.
 *   - It does not flatten `oneOf`/`anyOf`/`allOf` — no 2xx response schema
 *     in this repo's contracts uses them today (only the error bodies do,
 *     which this tool never looks at: see check-response-shapes.live.test.ts
 *     for why only 2xx is in scope). A schema node shaped that way is
 *     treated as opaque (no `properties`), which produces neither a false
 *     extra nor a false missing — it just stops recursing at that node.
 *   - Array recursion applies the SAME item schema to every element and
 *     unions the extra/missing fields found across all of them (deduplicated
 *     by path), capped at the first 50 elements — this repo's lists are
 *     paginated/bounded already (`pageSize` maxes at 200), and no scenario
 *     this story exercises produces more than a handful of items, so the cap
 *     is a safety margin, not an observed limitation.
 */

export interface InstanceDiffResult {
  /** Dot/bracket paths present in the instance but not declared in the schema's `properties` at that level — potential leaks. */
  readonly extra: string[];
  /** Dot/bracket paths the schema's `required` names but the instance omits (or sets to `undefined`) — would break a consumer relying on the contract. */
  readonly missing: string[];
}

const MAX_ARRAY_ITEMS_WALKED = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return isPlainObject(value);
}

function walk(schema: unknown, instance: unknown, path: string, extra: Set<string>, missing: Set<string>): void {
  if (!isSchemaObject(schema)) return; // nothing declarative to compare at this node (undefined, boolean schema, etc.)

  const properties = isPlainObject(schema.properties) ? schema.properties : undefined;
  const items = schema.items;
  const isArraySchema = schema.type === "array" || (properties === undefined && items !== undefined);

  if (isArraySchema) {
    if (!Array.isArray(instance)) return; // type mismatch — out of scope, see module doc
    const itemSchema = items;
    const limit = Math.min(instance.length, MAX_ARRAY_ITEMS_WALKED);
    for (let i = 0; i < limit; i += 1) {
      walk(itemSchema, instance[i], `${path}[]`, extra, missing);
    }
    return;
  }

  if (!properties) return; // e.g. a bare `{type: "string"}` or a map-only object (`additionalProperties` only) — nothing field-level to check, see module doc

  if (!isPlainObject(instance)) return; // instance isn't an object at this node — a genuine type mismatch, not this function's job to report

  const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : [];
  for (const key of required) {
    if (typeof key !== "string") continue;
    if (!(key in instance) || instance[key] === undefined) {
      missing.add(`${path}.${key}`);
    }
  }

  for (const key of Object.keys(instance)) {
    if (!(key in properties)) {
      extra.add(`${path}.${key}`);
    }
  }

  for (const [key, childSchema] of Object.entries(properties)) {
    const childInstance = instance[key];
    if (childInstance === undefined || childInstance === null) continue; // absence already covered by the `required` check above; a present-but-null optional field has nothing further to recurse into
    walk(childSchema, childInstance, `${path}.${key}`, extra, missing);
  }
}

/**
 * Diffs one real response body against the contract's schema for it.
 * `rootLabel` names the diff's root in reported paths (conventionally the
 * route key) so a flattened list of findings across many routes stays
 * unambiguous without extra bookkeeping by the caller.
 */
export function diffResponseInstance(
  schema: unknown,
  instance: unknown,
  rootLabel = "$",
): InstanceDiffResult {
  const extra = new Set<string>();
  const missing = new Set<string>();
  walk(schema, instance, rootLabel, extra, missing);
  return { extra: [...extra].sort(), missing: [...missing].sort() };
}
