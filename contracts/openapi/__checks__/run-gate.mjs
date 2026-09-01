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
 * THE RULE THIS SCRIPT ENFORCES INSTEAD
 *
 *   Fail if, and only if, an error lands in a `*-compat.ts` file.
 *
 * Those files are the contract↔implementation bindings. An error there means
 * a contract and the code it describes have genuinely diverged. Errors
 * anywhere else are noise from the closure and are reported, not judged.
 *
 * The closure size is printed on every run precisely because it is now known
 * to drift: 97 files before E04-S060, 287 after. Watching that number move is
 * how the next person notices the same thing happening again. Shrinking it
 * back — by making the compat checks import type-only entry points instead of
 * whole service barrels — belongs to E03-S034, which also wires this script
 * into CI. This script is the command it will wire.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const closure = lines.filter((l) => l.startsWith("/")).length;
const errors = lines.filter((l) => /error TS\d+:/.test(l));
const compatErrors = errors.filter((l) => /-compat\.ts\(/.test(l));

console.log(`contract gate: ${closure} files in the type closure, ${errors.length} error(s) total`);

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

if (compatErrors.length > 0) {
  console.error(
    `\nFAIL: ${compatErrors.length} error(s) in *-compat.ts — a contract and its ` +
      `implementation have diverged:\n`,
  );
  for (const line of compatErrors) console.error(`  ${line}`);
  process.exit(1);
}

console.log("PASS: no error in any *-compat.ts.");
process.exit(0);
