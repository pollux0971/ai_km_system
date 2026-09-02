/**
 * Normalisation + structural diff between a contract-side JSON Schema
 * (already fully `$ref`-dereferenced by `load-contracts.ts`) and a
 * runtime-side JSON Schema (whatever a live route's `routeOptions.schema`
 * literally is, or a schema this tool synthesised from OpenAPI
 * `parameters:` — see `synthesize.ts`).
 *
 * ── NORMALISATION RULES (every one is applied identically to BOTH sides
 *    unless stated otherwise) ──────────────────────────────────────────
 *
 * 1. Strip `description`, `title`, `examples`/`example` and any `x-*`
 *    vendor extension, recursively. These are documentation/annotation
 *    keywords with zero effect on ajv validation — the contract's prose
 *    and a route's (usually absent) comments can differ in wording forever
 *    without that being a real divergence. WHAT THIS COULD HIDE: nothing
 *    that affects request validation. It WOULD hide a case where a
 *    genuinely load-bearing constraint was smuggled into an `x-*`
 *    extension instead of a real keyword — not a pattern this repo's
 *    contracts use today (`x-required-roles` is informational, not
 *    validated, by its own doc comment in analytics.yaml).
 *
 * 2. Sort `required` arrays before comparing. `required` is a SET in JSON
 *    Schema — `["a","b"]` and `["b","a"]` reject exactly the same
 *    requests. WHAT THIS COULD HIDE: nothing — there is no request that
 *    validates differently under one order versus the other.
 *
 * 3. Sort `enum` arrays before comparing, same reasoning: ajv's `enum`
 *    check is membership, not order. WHAT THIS COULD HIDE: nothing for
 *    validation. It WOULD hide an enum whose declared ORDER is meant to
 *    convey something outside validation (e.g. a UI dropdown's display
 *    order derived from the contract) — not a documented convention
 *    anywhere in these contracts today, and even if it were, this tool's
 *    job is "does the VALIDATOR match", not "does the UI match".
 *
 * ── ONE ASYMMETRIC RULE (applied only where it is named, not globally) ──
 *
 * 4. `additionalProperties`: OpenAPI's `parameters:` list (used for every
 *    querystring in this repo — no `$ref` target exists for "the set of
 *    query parameters" the way one exists for a request body) has NO
 *    field meaning "reject unlisted query params" — the keyword simply
 *    does not exist at that level of the spec. `synthesize.ts` therefore
 *    never emits `additionalProperties` for a synthesised querystring
 *    object. Every querystring route in this repo, meanwhile, explicitly
 *    writes `additionalProperties: false`. Treating "contract omits the
 *    key" + "runtime says `false`" as a MATCH is the only way a
 *    synthesised querystring schema could ever match at all — the
 *    alternative is permanent, meaningless DIVERGES on literally every
 *    querystring route, which teaches readers to stop trusting DIVERGES.
 *    Any OTHER combination is compared literally: contract omitting the
 *    key + runtime `true` is NOT normalised (a runtime that dropped its
 *    `false` would be a real, reportable loosening), and a BODY schema
 *    (which always has a real named component, so the contract always
 *    states `additionalProperties` explicitly) never hits this rule at
 *    all — its two sides are compared with no leniency.
 *    WHAT THIS COULD HIDE: a contract that genuinely wanted to allow an
 *    unlisted query parameter through (rare, and not the case for any
 *    query parameter in this repo today) would not be flagged when the
 *    runtime instead rejects it. That is a one-directional, stricter-only
 *    blind spot — it can never hide a runtime that is LOOSER than the
 *    contract, only one that is tighter.
 *
 * `default` is DELIBERATELY NOT normalised away, even though one real
 * route (`GET /admin/metrics/latency`'s `days`) has a contract that
 * explicitly says "implementation decides the default" while the runtime
 * schema adds `default: 7`. That is a genuine structural difference
 * between the two schemas, and per this story's own instruction — "A rule
 * that silently equates two genuinely different things is worse than a
 * false red" — this tool reports it as DIVERGES rather than inventing a
 * blanket "ignore `default`" rule that would just as happily hide a
 * FUTURE route silently changing a contractually-pinned default (e.g.
 * `pageSize`'s contractually-frozen `20`) without anyone noticing.
 *
 * `format` is, with exactly ONE narrow, named exception, NOT normalised:
 * a blanket "ignore format" rule would swallow a REAL mismatch like
 * `format: uuid` vs `format: date-time`, which ajv-formats validates for
 * real — one inert keyword is not worth a rule that can hide a live one.
 *
 * THE ONE EXCEPTION — `format: "password"` is stripped, and only that
 * literal value. `auth.yaml`'s `LoginRequest.password` declares
 * `format: password`; `services/identity/src/plugin.ts`'s
 * `LOGIN_REQUEST_SCHEMA` omits it. Unlike every other format, this is not
 * "this app doesn't recognise it so it becomes a no-op" (that describes
 * `apps/api/src/contracts.ts`'s `registerUnknownFormats` fallback, which
 * WOULD be too broad a reason to normalise); `password` ships inside
 * `ajv-formats` itself, and its own source
 * (`ajv-formats/dist/formats.js`) defines it as the literal `true` —
 * verified by reading that file in this repo's `node_modules` while
 * building this tool, not assumed. `true` as a format validator means
 * ajv-formats' AUTHORS defined it as always-valid, by design, for exactly
 * this OpenAPI convention (marking a field sensitive for tooling/UI
 * masking, never a real constraint). Removing it therefore cannot hide a
 * behavioural difference — there is no behaviour attached to it, in this
 * library, on either side of the diff, ever. This is the same shape of
 * exception as rule 4: narrow, named, and justified by a specific,
 * checkable fact, not a category of keyword.
 */

export type JsonValue = unknown;

const ANNOTATION_KEYS = new Set(["description", "title", "examples", "example"]);
const ORDERLESS_ARRAY_KEYS = new Set(["required", "enum"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Rule 1 + rule 2/3 (sorting) — see module doc. Produces a fresh, deep-cloned tree. */
export function normalizeSchema(value: JsonValue, keyHint?: string): JsonValue {
  if (Array.isArray(value)) {
    const mapped = value.map((item) => normalizeSchema(item));
    if (keyHint !== undefined && ORDERLESS_ARRAY_KEYS.has(keyHint) && mapped.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
      return [...(mapped as (string | number | boolean)[])].sort();
    }
    return mapped;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (ANNOTATION_KEYS.has(key) || key.startsWith("x-")) continue;
      // The one named `format` exception — see module doc.
      if (key === "format" && child === "password") continue;
      out[key] = normalizeSchema(child, key);
    }
    return out;
  }
  return value;
}

export interface DiffSide {
  readonly present: boolean;
  readonly value?: unknown;
}

export interface DiffEntry {
  /** Dot/bracket path from the schema root, e.g. `properties.days.default`. */
  readonly path: string;
  readonly contract: DiffSide;
  readonly runtime: DiffSide;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Diffs two ALREADY-NORMALISED (`normalizeSchema`-passed) schema trees.
 * `contractSide`/`runtimeSide` name which tree is which — required only
 * for rule 4 (`additionalProperties`), which is asymmetric.
 */
export function diffNormalized(contractNode: unknown, runtimeNode: unknown, path = "(root)"): DiffEntry[] {
  if (isPlainObject(contractNode) && isPlainObject(runtimeNode)) {
    const entries: DiffEntry[] = [];
    const keys = new Set([...Object.keys(contractNode), ...Object.keys(runtimeNode)]);
    for (const key of keys) {
      const childPath = `${path}.${key}`;
      const inContract = Object.prototype.hasOwnProperty.call(contractNode, key);
      const inRuntime = Object.prototype.hasOwnProperty.call(runtimeNode, key);

      // Rule 4 — see module doc "ONE ASYMMETRIC RULE".
      if (key === "additionalProperties" && !inContract && inRuntime && runtimeNode[key] === false) {
        continue;
      }

      if (inContract && inRuntime) {
        entries.push(...diffNormalized(contractNode[key], runtimeNode[key], childPath));
      } else if (inContract) {
        entries.push({ path: childPath, contract: { present: true, value: contractNode[key] }, runtime: { present: false } });
      } else {
        entries.push({ path: childPath, contract: { present: false }, runtime: { present: true, value: runtimeNode[key] } });
      }
    }
    return entries;
  }

  if (deepEqual(contractNode, runtimeNode)) return [];
  return [{ path, contract: { present: true, value: contractNode }, runtime: { present: true, value: runtimeNode } }];
}

/** Convenience: normalize both sides then diff. What most callers want. */
export function diffSchemas(contractSchema: unknown, runtimeSchema: unknown): DiffEntry[] {
  return diffNormalized(normalizeSchema(contractSchema), normalizeSchema(runtimeSchema));
}

export function formatDiffEntry(entry: DiffEntry): string {
  const side = (s: DiffSide): string => (s.present ? JSON.stringify(s.value) : "(absent)");
  return `  ${entry.path}: contract=${side(entry.contract)}  runtime=${side(entry.runtime)}`;
}
