#!/usr/bin/env node
/**
 * Closure path allowlist for the contract drift gate (E04-S065 back half,
 * piece A).
 *
 * WHY AN ALLOWLIST AND NOT "no file under apps/"
 *
 * "The closure must not contain apps/" blocks exactly the one disease this
 * gate has already had (5-xi: apps/web's `process.env` reads dragged in via
 * `conversations-compat.ts`, masked once by an unrelated barrel change, then
 * unmasked again — see run-gate.mjs's own header). It says nothing about
 * `tools/`, `tests/`, or whatever entry point nobody has written yet. An
 * allowlist of the roots this gate is actually SUPPOSED to touch is the only
 * form of this rule that also catches those.
 *
 * ROOTS
 *
 *   - contracts/openapi/__checks__/   — this gate's own files.
 *   - packages/*<forward-slash>src/   — Team A's own typed-client packages.
 *     The spec that named this root wrote `packages/types/` alone; the
 *     ACTUAL closure today also legitimately pulls in
 *     `packages/api-client/src/*` and `packages/auth-client/src/*`
 *     (auth-compat.ts imports auth-client directly; api-client's own
 *     generated/*.d.ts come along transitively). Both are Team A's own
 *     typed-client packages (CLAUDE.md 鐵律 #3: web/BFF talk to services only
 *     through `@ai-km/api-client`), not a symptom of the apps/ leak this gate
 *     exists to catch, so the root is `packages/*<forward-slash>src/`, parallel to
 *     `services/*<forward-slash>src/`, rather than the one hardcoded package name that
 *     would make this allowlist reject the gate's own already-correct,
 *     already-reviewed compat files on day one.
 *   - services/*<forward-slash>src/          — implementation seams the compat files bind to.
 *   - node_modules/@types/*    — ambient type packages (e.g. the 68
 *     @types/node files pulled in by services/conversation's genuine need
 *     for better-sqlite3's types — legitimate, not a problem to hide).
 *   - node_modules/**<forward-slash>*.d.ts, *.d.mts, *.d.cts — any other
 *     dependency's own type declarations (typescript's lib.*.d.ts,
 *     openapi-fetch's index.d.mts, undici-types, ...). Never a dependency's
 *     runtime source — only its declarations.
 *
 * Anything else in the closure is a violation: a real source file from
 * outside these roots reachable through a type-only import chain, exactly
 * the shape of the apps/web leak.
 */
import path from "node:path";

const PACKAGES_SRC = /^packages\/[^/]+\/src\//;
const SERVICES_SRC = /^services\/[^/]+\/src\//;
const CHECKS_ROOT = "contracts/openapi/__checks__/";
const NODE_MODULES_TYPES = /(^|\/)node_modules\/@types\//;
const NODE_MODULES_DECLARATION = /(^|\/)node_modules\/.*\.d\.(ts|mts|cts)$/;

/** True if `relPath` (repo-root-relative, forward-slash) sits under an allowed root. */
export function isAllowedClosurePath(relPath) {
  return (
    relPath.startsWith(CHECKS_ROOT) ||
    PACKAGES_SRC.test(relPath) ||
    SERVICES_SRC.test(relPath) ||
    NODE_MODULES_TYPES.test(relPath) ||
    NODE_MODULES_DECLARATION.test(relPath)
  );
}

/**
 * Returns the repo-root-relative paths of every closure file that is NOT
 * under an allowed root, sorted for stable output.
 */
export function findClosureViolations(repoRoot, absoluteClosureFiles) {
  const violations = [];
  for (const abs of absoluteClosureFiles) {
    const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
    if (!isAllowedClosurePath(rel)) violations.push(rel);
  }
  return violations.sort();
}
