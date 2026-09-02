#!/usr/bin/env node
/**
 * Binding-coverage analysis for the contract drift gate (E04-S065 back half,
 * piece C).
 *
 * WHAT THIS ANSWERS
 *
 * For every schema every `contracts/openapi/*.yaml` declares, does the
 * matching `*-compat.ts` file actually tie that schema to a real
 * implementation type — or does it only exist in the generated `.d.ts` and
 * in nobody's cross-check? E04-S069 found one instance of the second kind
 * (`conversations.yaml`'s `ChangeEvent`) by hand, while reading one file for
 * an unrelated repoint. That is not a repeatable process — it is what
 * happens to be found. This module makes the question mechanical so the
 * answer is printed on every run instead of rediscovered by accident.
 *
 * HOW SCHEMA NAMES ARE EXTRACTED FROM YAML (no YAML parser — none is an
 * installed dependency, and this story does not add one; js-yaml sits in the
 * pnpm store as a transitive dependency of tooling, but reaching into
 * another package's undeclared nested store path is a worse dependency than
 * a documented, narrow text scan)
 *
 * Every contract in this repo writes `components:` at column 0, its
 * `schemas:` child at a 2-space indent, and each schema name as a 4-space-
 * indented `Name:` key — verified against all seven files under
 * contracts/openapi/*.yaml at the time this was written. The scanner below
 * looks for exactly that shape and stops the `schemas:` block at the next
 * 2-space-indented sibling key (`responses:`, `parameters:`, ...) or the end
 * of `components:`. LIMITATION, stated plainly: this is a structural scan of
 * this repo's own consistent formatting, not a YAML parser. A contract that
 * used a different indent width, flow-style mappings, or reordered
 * `components:` before some other top-level key in a way that breaks the
 * "back to column 0 ends components" rule would be mis-scanned silently.
 * Redocly lint (README step 3) is what actually validates these files are
 * well-formed OpenAPI; this scanner only reads the one shape it needs.
 *
 * HOW "BOUND" IS DETERMINED FROM THE COMPAT FILE (TypeScript AST, not a
 * regex over import names)
 *
 * A regex over import identifiers cannot tell the difference between a
 * schema that is genuinely cross-checked against an implementation type and
 * one that only appears in a self-referential shape check — and that
 * difference is exactly what this exists to catch. `ChangeEvent` has a
 * check in `conversations-compat.ts` today
 * (`changeEventOwnerFree: OwnerFree<Schemas["ChangeEvent"]> = true`) — an
 * import-name regex that just asked "is ChangeEvent mentioned near an
 * import" would call that bound. It is not: `OwnerFree` is a type alias
 * declared inside the compat file itself, not an implementation type, and
 * the check only inspects the CONTRACT's own schema for a forbidden key. So
 * this module parses each compat file with the TypeScript compiler API and:
 *
 *   1. Collects which imported identifiers come from a module OTHER than
 *      `./generated/*` — those are "implementation identifiers" (real
 *      provider/consumer types, e.g. `AuthSession` from `packages/auth-client`,
 *      `ConversationRow` from `services/conversation`). Identifiers imported
 *      FROM `./generated/*` (the OpenAPI-derived `components` type) do not
 *      count — comparing a schema only to itself proves nothing.
 *   2. Finds the local alias for `components["schemas"]` (conventionally
 *      named `Schemas` in every file here, but detected structurally rather
 *      than hardcoded to that name) so `Schemas["X"]` and the equivalent
 *      inline `components["schemas"]["X"]` are both recognised.
 *   3. Builds a small dependency graph over the file's top-level `const`
 *      declarations: two declarations are linked if one's type annotation or
 *      initializer references the other by name (this is what connects, e.g.,
 *      `const conversationRow: ConversationRow = conversationSample` back to
 *      `const conversationSample: Schemas["Conversation"] = {...}` two
 *      statements above it — the schema-side type and the implementation-side
 *      type live in different statements, joined only by that shared local
 *      identifier).
 *   4. For each connected component in that graph, collects every schema name
 *      any member references via `Schemas["X"]`, and marks all of them BOUND
 *      if and only if the component also references at least one
 *      implementation identifier from step 1.
 *
 * STATED LIMITATIONS OF THE AST METHOD (an honest count beats a confident
 * wrong one):
 *
 *   - A schema checked only as a NESTED field of another schema — e.g. if
 *     some file only ever wrote `Schemas["Parent"]["child"]` and never
 *     `Schemas["Child"]` on its own — will not be detected as bound to
 *     `Child`, even though the parent check happens to exercise its shape.
 *     `analytics-compat.ts`'s `FeedbackVerdict` is a real instance of this:
 *     it is only ever reached via `Schemas["FeedbackItem"]["verdict"]`, so it
 *     is reported UNBOUND by this tool despite `verdictExact` doing
 *     meaningful, real work on that exact field.
 *   - Any import from a module other than `./generated/*` counts as an
 *     "implementation identifier", however many barrels or re-exports sit
 *     between that import and the code that actually serialises the
 *     response. A compat file that imported a hand-copied mirror type from
 *     some third module (neither `./generated/*` nor the real seam) would be
 *     reported BOUND by this tool even though it is not bound to anything
 *     real. Nothing here re-verifies that an "implementation identifier" is
 *     the genuine seam — that judgment is what the file's own header comment
 *     and human review are still for.
 *   - Only same-file, same-statement-or-adjacent-local-variable connections
 *     are traced. A binding expressed through a function call, a spread, or
 *     a destructure (none of which this repo's compat files currently use)
 *     would not be followed.
 *   - Comments are never read as evidence either way — a schema documented
 *     as "deliberately unbound" is judged only by what the code does, and a
 *     schema commented "bound below" that in fact never binds is reported
 *     UNBOUND. Code, not prose, is the source of truth here on purpose.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Schema names declared directly under a contract's `components: schemas:`. */
export function extractYamlSchemaNames(yamlText) {
  const lines = yamlText.split("\n");
  const names = [];
  let inComponents = false;
  let inSchemas = false;
  for (const line of lines) {
    if (/^components:\s*$/.test(line)) {
      inComponents = true;
      inSchemas = false;
      continue;
    }
    if (inComponents && /^\S/.test(line)) {
      // Back to column 0 — components: block has ended.
      inComponents = false;
      inSchemas = false;
    }
    if (!inComponents) continue;
    if (/^ {2}schemas:\s*$/.test(line)) {
      inSchemas = true;
      continue;
    }
    if (inSchemas && /^ {2}\S/.test(line)) {
      // A sibling of schemas: (responses:, parameters:, securitySchemes:, ...)
      inSchemas = false;
    }
    if (inSchemas) {
      const m = line.match(/^ {4}([A-Za-z_][A-Za-z0-9_]*):/);
      if (m) names.push(m[1]);
    }
  }
  return names;
}

/**
 * Parses one `*-compat.ts` file and returns the set of schema names it
 * actually binds to an implementation type, per the algorithm documented at
 * the top of this file.
 */
export function findBoundSchemas(compatFilePath, knownSchemaNames) {
  const text = fs.readFileSync(compatFilePath, "utf8");
  const sourceFile = ts.createSourceFile(compatFilePath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const knownSet = new Set(knownSchemaNames);
  const implIdentifiers = new Set();
  const componentsLocalNames = new Set();

  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const spec = stmt.moduleSpecifier.text;
    const isGenerated = spec.startsWith("./generated/");
    const clause = stmt.importClause;
    if (!clause) continue;
    const bucket = isGenerated ? componentsLocalNames : implIdentifiers;
    if (clause.name) bucket.add(clause.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) bucket.add(el.name.text);
    }
  }

  const schemasAliasNames = new Set();
  for (const stmt of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(stmt)) continue;
    const t = stmt.type;
    if (
      ts.isIndexedAccessTypeNode(t) &&
      ts.isLiteralTypeNode(t.indexType) &&
      ts.isStringLiteral(t.indexType.literal) &&
      t.indexType.literal.text === "schemas" &&
      ts.isTypeReferenceNode(t.objectType) &&
      ts.isIdentifier(t.objectType.typeName) &&
      componentsLocalNames.has(t.objectType.typeName.text)
    ) {
      schemasAliasNames.add(stmt.name.text);
    }
  }

  function schemaNameFromIndexedAccess(node) {
    if (!ts.isIndexedAccessTypeNode(node)) return null;
    if (!ts.isLiteralTypeNode(node.indexType) || !ts.isStringLiteral(node.indexType.literal)) return null;
    const key = node.indexType.literal.text;
    const obj = node.objectType;
    if (ts.isTypeReferenceNode(obj) && ts.isIdentifier(obj.typeName) && schemasAliasNames.has(obj.typeName.text)) {
      return key;
    }
    if (
      ts.isIndexedAccessTypeNode(obj) &&
      ts.isLiteralTypeNode(obj.indexType) &&
      ts.isStringLiteral(obj.indexType.literal) &&
      obj.indexType.literal.text === "schemas" &&
      ts.isTypeReferenceNode(obj.objectType) &&
      ts.isIdentifier(obj.objectType.typeName) &&
      componentsLocalNames.has(obj.objectType.typeName.text)
    ) {
      return key;
    }
    return null;
  }

  function collectSchemaNames(node, into) {
    const visit = (n) => {
      const sn = schemaNameFromIndexedAccess(n);
      if (sn && knownSet.has(sn)) into.add(sn);
      ts.forEachChild(n, visit);
    };
    visit(node);
  }

  function collectIdentifiers(node, into) {
    const visit = (n) => {
      if (ts.isIdentifier(n)) into.add(n.text);
      ts.forEachChild(n, visit);
    };
    visit(node);
  }

  const decls = [];
  const declByName = new Map();
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue;
      const name = decl.name.text;
      const schemaNames = new Set();
      const refs = new Set();
      if (decl.type) {
        collectSchemaNames(decl.type, schemaNames);
        collectIdentifiers(decl.type, refs);
      }
      if (decl.initializer) {
        collectSchemaNames(decl.initializer, schemaNames);
        collectIdentifiers(decl.initializer, refs);
      }
      refs.delete(name);
      const entry = { name, schemaNames, refs };
      decls.push(entry);
      declByName.set(name, entry);
    }
  }

  // Union-find over top-level declarations, linked by same-file identifier references.
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const d of decls) parent.set(d.name, d.name);
  for (const d of decls) {
    for (const r of d.refs) {
      if (declByName.has(r)) union(d.name, r);
    }
  }

  const components = new Map();
  for (const d of decls) {
    const root = find(d.name);
    if (!components.has(root)) components.set(root, { schemaNames: new Set(), hasImplRef: false });
    const c = components.get(root);
    for (const s of d.schemaNames) c.schemaNames.add(s);
    for (const r of d.refs) {
      if (implIdentifiers.has(r)) c.hasImplRef = true;
    }
  }

  const bound = new Set();
  for (const c of components.values()) {
    if (c.hasImplRef) for (const s of c.schemaNames) bound.add(s);
  }
  return bound;
}

/**
 * Runs the full binding-coverage analysis over every `contracts/openapi/*.yaml`
 * against its `<name>-compat.ts` in `contracts/openapi/__checks__/`.
 *
 * Returns an array of { yaml, compatFile, schemas, bound, unbound }.
 * `compatFile` is `null` when no `<name>-compat.ts` exists at all — in that
 * case every schema in the contract is unbound, with no compat file to blame
 * it on individually.
 */
export function analyzeBindingCoverage(repoRoot, checksDir) {
  const openapiDir = path.join(repoRoot, "contracts/openapi");
  const yamlFiles = fs
    .readdirSync(openapiDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort();

  const results = [];
  for (const yamlFile of yamlFiles) {
    const yamlPath = path.join(openapiDir, yamlFile);
    const schemas = extractYamlSchemaNames(fs.readFileSync(yamlPath, "utf8"));
    const base = yamlFile.replace(/\.yaml$/, "");
    const compatFile = path.join(checksDir, `${base}-compat.ts`);
    const hasCompatFile = fs.existsSync(compatFile);
    const bound = hasCompatFile ? findBoundSchemas(compatFile, schemas) : new Set();
    const unbound = schemas.filter((s) => !bound.has(s));
    results.push({
      yaml: yamlFile,
      compatFile: hasCompatFile ? path.relative(repoRoot, compatFile) : null,
      schemas,
      bound: schemas.filter((s) => bound.has(s)),
      unbound,
    });
  }
  return results;
}
