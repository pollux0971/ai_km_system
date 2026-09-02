#!/usr/bin/env node
/**
 * Contract drift gate.
 *
 * WHY THIS IS A SCRIPT AND NOT A REVIEWER'S GREP
 *
 * Until 2026-09-02 the acceptance rule for this gate was "tsc must report
 * exactly 6 errors" — a number every reviewer re-typed by hand. That rule
 * broke the first time it mattered. E04-S060 repointed an import in an
 * unrelated package at a barrel that also exports a Fastify plugin; Fastify
 * pulled in ajv, ajv pulled in @types/node, `process` became resolvable, and
 * the six pre-existing `TS2591: Cannot find name 'process'` errors vanished.
 * Identical sources on both sides, verified by md5. The errors were not fixed,
 * they were MASKED — and the count went from 6 to 0 with nothing in the
 * contracts changing at all.
 *
 * So the count measures the size of the type closure, not contract drift. A
 * gate whose pass condition is another module's export list is not a gate.
 *
 * THE RULE THIS SCRIPT ENFORCES INSTEAD (three independent checks, ANY of
 * which failing fails the whole gate)
 *
 *   1. Fail if an error lands in a `*-compat.ts` file — a contract and the
 *      code it describes have genuinely diverged.
 *   2. Fail if any file in the type closure sits outside the roots this gate
 *      is supposed to touch — see ./closure-allowlist.mjs. This replaces a
 *      file-count ceiling that was considered and rejected: E04-S069 grew
 *      the closure from 98 files to 202 while fixing a real problem (see
 *      docs/stories/PROGRESS.md's E04-S065 row), so a ceiling would have
 *      gone red on a *good* change. The closure size is still printed on
 *      every run — a readable signal, not a gate.
 *   3. Fail if any contract schema is UNBOUND (no `*-compat.ts` assertion
 *      ties it to a real implementation type) and not listed in
 *      ./unbound-schema-allowlist.mjs — see ./binding-coverage.mjs for how
 *      "bound" is determined and what that method misses.
 *
 * Errors anywhere else in the closure (outside `*-compat.ts`) are noise from
 * the closure's size and are reported, not judged — same as before.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findClosureViolations } from "./closure-allowlist.mjs";
import { analyzeBindingCoverage } from "./binding-coverage.mjs";
import { UNBOUND_SCHEMA_ALLOWLIST } from "./unbound-schema-allowlist.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const tsc = path.join(repoRoot, "node_modules/.bin/tsc");
const project = path.join(here, "tsconfig.json");

let out = "";
try {
  out = execFileSync(tsc, ["-p", project, "--noEmit", "--listFiles"], {
    encoding: "utf8",
    cwd: repoRoot,
  });
} catch (error) {
  // tsc exits non-zero when it reports errors; its output is what we want.
  out = `${error.stdout ?? ""}${error.stderr ?? ""}`;
}

const lines = out.split("\n");
const closureFiles = lines.filter((l) => l.startsWith("/"));
const errors = lines.filter((l) => /error TS\d+:/.test(l));
const compatErrors = errors.filter((l) => /-compat\.ts\(/.test(l));

console.log(`contract gate: ${closureFiles.length} files in the type closure, ${errors.length} error(s) total`);

if (errors.length > 0) {
  const byFile = new Map();
  for (const line of errors) {
    const file = line.split("(")[0] ?? "(unknown)";
    byFile.set(file, (byFile.get(file) ?? 0) + 1);
  }
  console.log("  errors by file (informational unless the file is a *-compat.ts):");
  for (const [file, n] of [...byFile].sort()) {
    console.log(`    ${n.toString().padStart(3)}  ${path.relative(repoRoot, file)}`);
  }
}

let failed = false;

/* ── Check 1: *-compat.ts errors ────────────────────────────────────────── */

if (compatErrors.length > 0) {
  failed = true;
  console.error(
    `\nFAIL: ${compatErrors.length} error(s) in *-compat.ts — a contract and its ` +
      `implementation have diverged:\n`,
  );
  for (const line of compatErrors) console.error(`  ${line}`);
} else {
  console.log("PASS: no error in any *-compat.ts.");
}

/* ── Check 2: closure path allowlist ────────────────────────────────────── */

const closureViolations = findClosureViolations(repoRoot, closureFiles);
if (closureViolations.length > 0) {
  failed = true;
  console.error(
    `\nFAIL: ${closureViolations.length} file(s) in the type closure sit outside every ` +
      `allowed root (see closure-allowlist.mjs):\n`,
  );
  for (const p of closureViolations) console.error(`  ${p}`);
} else {
  console.log(`PASS: all ${closureFiles.length} closure files sit under an allowed root.`);
}

/* ── Check 3: binding coverage ───────────────────────────────────────────── */

const coverage = analyzeBindingCoverage(repoRoot, here);
const allowlistIndex = new Set(UNBOUND_SCHEMA_ALLOWLIST.map((e) => `${e.yaml}::${e.schema}`));
const unescalated = [];

console.log("\nbinding coverage (BOUND = tied to a real implementation type in a *-compat.ts; see binding-coverage.mjs):");
for (const r of coverage) {
  console.log(`  ${r.yaml}${r.compatFile ? "" : "  (no compat file — every schema is UNBOUND)"}`);
  for (const s of r.bound) console.log(`    BOUND    ${s}`);
  for (const s of r.unbound) {
    const key = `${r.yaml}::${s}`;
    const allowed = allowlistIndex.has(key);
    console.log(`    UNBOUND  ${s}${allowed ? "  (allowlisted)" : ""}`);
    if (!allowed) unescalated.push(key);
  }
}

if (unescalated.length > 0) {
  failed = true;
  console.error(
    `\nFAIL: ${unescalated.length} UNBOUND schema(s) are not in ` +
      `unbound-schema-allowlist.mjs:\n`,
  );
  for (const key of unescalated) console.error(`  ${key}`);
} else {
  console.log("\nPASS: every UNBOUND schema is in unbound-schema-allowlist.mjs.");
}

/* ── Verdict ─────────────────────────────────────────────────────────────── */

if (failed) {
  console.error("\nFAIL: contract gate failed (see above).");
  process.exit(1);
}

console.log("\nPASS: contract gate passed.");
process.exit(0);
