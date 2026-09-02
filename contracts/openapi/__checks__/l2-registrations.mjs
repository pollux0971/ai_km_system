#!/usr/bin/env node
/**
 * L2 binding detection for the contract drift gate (E04-S065 back half,
 * correction 1, 2026-09-02).
 *
 * WHY THIS EXISTS: `binding-coverage.mjs`'s L0 check only recognises a
 * schema as bound when a `*-compat.ts` file ties it to an implementation
 * type at COMPILE time. Some routes instead pull their JSON Schema straight
 * out of the loaded OpenAPI spec at REGISTRATION time —
 * `app.contracts.getSchema("<spec>", "<Schema>")` — and hand it to Fastify's
 * `schema:` route option, which then validates every real request/response
 * against it with ajv. That is not a weaker gate than L0; it is a RUNTIME
 * one, arguably stronger (L0 compares two TypeScript shapes that could both
 * be wrong the same way; L2 rejects real malformed traffic). Counting an
 * L2-registered schema as UNBOUND — "no L0 binding" read as "no gate at
 * all" — is exactly the conflation this whole story exists to remove.
 *
 * METHOD: walk every `.ts` file in the repo (excluding `node_modules`,
 * `.git`, and any `dist` output directory — compiled output would double
 * every hit), parse each with the TypeScript compiler API, and find every
 * `CallExpression` whose callee is a `PropertyAccessExpression` named
 * `getSchema` with exactly two arguments, both string literals. A hit only
 * counts if the first literal is a real contract's file base name (e.g.
 * `"conversations"` for `contracts/openapi/conversations.yaml`) and the
 * second is one of that contract's actual schema names — this is what
 * excludes `apps/api/src/contracts.test.ts`'s own mechanism fixtures
 * (`getSchema("sample", "CreateWidgetRequest")`, `getSchema("nope", ...)`,
 * `getSchema("sample", "NoSuchSchema")`): `"sample"` and `"nope"` are not
 * real contract file names, so they never pass the filter, with no special
 * casing needed.
 *
 * This deliberately does NOT require the call site to be inside a route
 * handler or even inside `services/`: `apps/api/src/contracts.test.ts` and
 * `apps/api/src/server.test.ts` call `getSchema("conversations",
 * "Conversation")` / `getSchema("conversations", "NotFoundErrorBody")` to
 * exercise the registry directly rather than through a live route, but the
 * call site proves the same fact this check cares about — the schema is
 * fetchable from the loaded registry by exactly this name — and finding it
 * only where a live route happens to reference it would undercount.
 *
 * STATED LIMITATIONS:
 *   - Only the two-string-literal-argument shape is matched. A spec or
 *     schema name built from a variable, template literal, or re-exported
 *     constant (`getSchema(SPEC_NAME, schemaName)`) is invisible to this
 *     scan — none of the current call sites do this, but a future one
 *     could, silently under-reporting L2 coverage.
 *   - A hit only proves the schema CAN be fetched by name from the
 *     registry, not that the value returned is actually wired into a live
 *     route's `schema:` option and validated on every request — the two
 *     `apps/api` test-file hits are registry-mechanism checks, not proof
 *     that a route uses the result at request time. Read alongside the
 *     `services/*` route-file hits (which are used in a route's `schema:`
 *     option), not as an unconditional guarantee for every hit.
 *   - No attempt is made to check that the SHAPE of what `getSchema`
 *     returns is what the route thinks it is — this only proves "this
 *     schema is registered and fetched by name somewhere", which is the L2
 *     question, not "the fetched shape and the route's own type agree"
 *     (that is a different, unimplemented check — L2-EQ, tracked as its own
 *     follow-up story).
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SKIP_DIR_NAMES = new Set(["node_modules", ".git", "dist", ".turbo", ".next"]);

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
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        out.push(path.join(dir, entry.name));
      }
    }
  }
  return out;
}

/**
 * Scans `filePath` for `X.getSchema("spec", "Schema")` call sites and
 * returns every (spec, schema) pair found, regardless of whether it is a
 * real contract — filtering against known schemas is the caller's job (see
 * `findL2RegisteredSchemas`).
 */
function findGetSchemaCallsInFile(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "getSchema" &&
      node.arguments.length === 2 &&
      ts.isStringLiteral(node.arguments[0]) &&
      ts.isStringLiteral(node.arguments[1])
    ) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      hits.push({ spec: node.arguments[0].text, schema: node.arguments[1].text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return hits;
}

/**
 * Returns a Map keyed `"<yamlFile>::<SchemaName>"` -> array of
 * `{ file, line }` evidence locations, for every real (spec, schema) pair
 * found registered via `getSchema(...)` anywhere in the repo.
 *
 * `schemasByYaml` is `{ [yamlFile]: string[] }` — the same schema lists
 * `binding-coverage.mjs` already extracts from each contract, used here
 * purely as the filter that turns "any two string literals" into "a real
 * contract schema".
 */
export function findL2RegisteredSchemas(repoRoot, schemasByYaml) {
  const specToYaml = new Map();
  for (const yamlFile of Object.keys(schemasByYaml)) {
    specToYaml.set(yamlFile.replace(/\.yaml$/, ""), yamlFile);
  }

  const hits = new Map();
  for (const file of walkTsFiles(repoRoot)) {
    let calls;
    try {
      calls = findGetSchemaCallsInFile(file);
    } catch {
      continue;
    }
    if (calls.length === 0) continue;
    for (const call of calls) {
      const yamlFile = specToYaml.get(call.spec);
      if (!yamlFile) continue; // not a real contract spec name (e.g. "sample", "nope")
      const schemas = schemasByYaml[yamlFile] ?? [];
      if (!schemas.includes(call.schema)) continue; // not a real schema of that contract
      const key = `${yamlFile}::${call.schema}`;
      const list = hits.get(key) ?? [];
      list.push({ file: path.relative(repoRoot, file), line: call.line });
      hits.set(key, list);
    }
  }
  return hits;
}
