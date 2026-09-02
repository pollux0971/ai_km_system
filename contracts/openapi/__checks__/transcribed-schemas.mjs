#!/usr/bin/env node
/**
 * TRANSCRIBED-state detection for the contract drift gate (E04-S065 back
 * half, correction 2, 2026-09-02).
 *
 * THE FOURTH STATE: a schema can be UNBOUND (no gate at all), BOUND-L0
 * (typecheck-time), or BOUND-L2 (registered into Fastify's own runtime
 * validator via `getSchema`, see `l2-registrations.mjs`) — but several
 * routes take a fourth path: a hand-written JSON-Schema object literal,
 * copied from the contract by a human, passed to Fastify's `schema:` option
 * directly instead of fetched from the registry. Fastify still validates
 * real requests against it, so it is NOT the same as no gate at all — but
 * nothing compares that literal back to the contract it was copied from, so
 * it is also not the same as a real binding: the copy can drift from the
 * contract with nothing noticing, which is exactly what a `*-compat.ts`
 * L0 check or a `getSchema()` L2 fetch cannot do (both read the contract
 * live; a transcription reads it once, at write time, into prose).
 *
 * METHOD: services/conversation/src/routes/*.ts's and
 * services/feedback/src/routes/*.ts's own header comments already document
 * exactly this pattern in prose ("transcribed from
 * contracts/openapi/...", `CREATE_REVISION_BODY_SCHEMA`,
 * `CREATE_CONVERSATION_BODY_SCHEMA`, ...). Rather than trust prose (which
 * can go stale independently of the code, the same failure mode this whole
 * story exists to close), this scans for the STRUCTURAL pattern those
 * comments describe: a top-level `const SOME_NAME_BODY_SCHEMA = {...}`
 * declaration (excluding `*.test.ts`) whose initializer is an object
 * literal carrying `type: "object"` — i.e., something schema-shaped, not
 * just any constant that happens to end in that name.
 *
 * WHY THE NAMING CONVENTION (`*_BODY_SCHEMA`), NOT EVERY `*_SCHEMA`
 * CONSTANT: ten such constants exist across these two services' route
 * files, but four of them (`LIST_QUERYSTRING_SCHEMA`,
 * `USAGE_METRICS_QUERYSTRING_SCHEMA`, `LATENCY_METRICS_QUERYSTRING_SCHEMA`,
 * `LIST_FEEDBACK_QUERYSTRING_SCHEMA`) describe inline `parameters:`
 * querystrings, which OpenAPI has no `$ref` target for in this repo's
 * contracts (their own header comments say so explicitly) — there is no
 * `components.schemas` entry for these to be "transcribed" FROM. Scoping
 * to the `_BODY_SCHEMA` suffix is not cosmetic: deriving a schema name from
 * `USAGE_METRICS_QUERYSTRING_SCHEMA` (strip `_QUERYSTRING_SCHEMA` ->
 * `USAGE_METRICS` -> `UsageMetrics`) COLLIDES with `analytics.yaml`'s real
 * `UsageMetrics` schema (an unrelated response-shape schema for a
 * different route) — a false positive this scan avoids only by not
 * deriving names from the querystring constants at all. The six
 * `*_BODY_SCHEMA` constants that DO carry a schema name never produce this
 * collision because every one of their derived names ends in "Request",
 * which none of the four querystring constants' derived names do.
 *
 * NAME DERIVATION: strip the trailing `_BODY_SCHEMA`, convert the
 * remaining SCREAMING_SNAKE_CASE to PascalCase, then try, in order,
 * `<Pascal>Request`, `<Pascal>Body`, `<Pascal>` against the full set of
 * schema names every contract declares. E.g. `UPDATE_CONVERSATION_BODY_
 * SCHEMA` -> `UpdateConversation` -> `UpdateConversationRequest` (a real
 * `conversations.yaml` schema).
 *
 * STATED LIMITATIONS:
 *   - Depends entirely on the `<Domain>_BODY_SCHEMA` naming convention this
 *     repo's authors happened to use consistently. A transcribed schema
 *     literal named any other way is invisible to this scan.
 *   - The derived name is matched against schema names from EVERY
 *     contract, not just the one the file's routes implement — if two
 *     contracts ever declared the same schema name (none do today), the
 *     match would be ambiguous; this returns the first match found and
 *     does not defend against that collision.
 *   - Confirms only that a schema-shaped literal with a matching name
 *     exists — never diffs its actual properties against the contract's.
 *     A transcription that is stale (drifted from the yaml since it was
 *     written) is reported exactly the same as one that is faithful. That
 *     is the reason this state is not treated as equivalent to a real
 *     binding, and why it is not allowlist-eligible as UNBOUND but is also
 *     not counted as BOUND: closing that gap for real is the L2-EQ check
 *     tracked as this story's own follow-up (see run-gate.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const CANDIDATE_DIRS = ["services/conversation/src", "services/feedback/src"];
const BODY_SCHEMA_NAME = /^([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*)_BODY_SCHEMA$/;

function walkTsFiles(rootDir) {
  const out = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && /\.ts$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  return out;
}

function screamingSnakeToPascal(snake) {
  return snake
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join("");
}

function isSchemaShapedObjectLiteral(node) {
  if (!ts.isObjectLiteralExpression(node)) return false;
  return node.properties.some(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === "type" &&
      ts.isStringLiteral(p.initializer) &&
      p.initializer.text === "object",
  );
}

/** Unwraps `{...} as const` / `<const>{...}` so the object literal underneath is found either way. */
function unwrapObjectLiteral(node) {
  let n = node;
  while (ts.isAsExpression(n) || ts.isTypeAssertionExpression?.(n)) n = n.expression;
  return n;
}

function findBodySchemaConstantsInFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits = [];
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
      const m = decl.name.text.match(BODY_SCHEMA_NAME);
      if (!m) continue;
      const literal = unwrapObjectLiteral(decl.initializer);
      if (!isSchemaShapedObjectLiteral(literal)) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
      hits.push({ constantName: decl.name.text, domain: m[1], line: line + 1 });
    }
  }
  return hits;
}

/**
 * Returns a Map keyed `"<yamlFile>::<SchemaName>"` -> array of
 * `{ file, line, constantName }` evidence, for every `*_BODY_SCHEMA`
 * constant whose derived name resolves to a real schema.
 *
 * `schemasByYaml` is `{ [yamlFile]: string[] }`, same shape as
 * `l2-registrations.mjs` takes.
 */
export function findTranscribedSchemas(repoRoot, schemasByYaml) {
  const allSchemaOwners = new Map(); // schemaName -> yamlFile (first match wins; see stated limitation)
  for (const [yamlFile, names] of Object.entries(schemasByYaml)) {
    for (const name of names) {
      if (!allSchemaOwners.has(name)) allSchemaOwners.set(name, yamlFile);
    }
  }

  const hits = new Map();
  for (const dir of CANDIDATE_DIRS) {
    const absDir = path.join(repoRoot, dir);
    for (const file of walkTsFiles(absDir)) {
      let found;
      try {
        found = findBodySchemaConstantsInFile(file);
      } catch {
        continue;
      }
      for (const hit of found) {
        const pascal = screamingSnakeToPascal(hit.domain);
        const candidates = [`${pascal}Request`, `${pascal}Body`, pascal];
        const matchedSchema = candidates.find((c) => allSchemaOwners.has(c));
        if (!matchedSchema) continue;
        const yamlFile = allSchemaOwners.get(matchedSchema);
        const key = `${yamlFile}::${matchedSchema}`;
        const list = hits.get(key) ?? [];
        list.push({ file: path.relative(repoRoot, file), line: hit.line, constantName: hit.constantName });
        hits.set(key, list);
      }
    }
  }
  return hits;
}
