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
 *   3. Fail if any contract schema is UNBOUND — none of BOUND-L0 (a
 *      `*-compat.ts` typecheck-time binding), BOUND-L2 (a route registers it
 *      into Fastify's runtime validator via a literal
 *      `getSchema("<spec>", "<Schema>")`), or TRANSCRIBED (a route
 *      hand-writes a schema literal copied from the contract) apply — and
 *      it is not covered by a class in ./unbound-schema-allowlist.mjs. See
 *      ./binding-coverage.mjs for how each state is determined and what
 *      each method misses; "no BOUND-L0" is NOT "no gate" — L2 is a runtime
 *      gate, arguably stronger than a compile-time one, and conflating the
 *      two was corrected here on 2026-09-02 (see docs/stories/PROGRESS.md's
 *      E04-S065 row).
 *
 * Errors anywhere else in the closure (outside `*-compat.ts`) are noise from
 * the closure's size and are reported, not judged — same as before.
 *
 * FOURTH CHECK, ADDED 2026-09-03 (E04-S073 follow-up, "gate-response-shape")
 * — response-shape, GATED; route-schema, OBSERVED ONLY
 *
 * `tools/contract-equivalence/` (E04-S073's own L2-EQ package) ships two
 * live checks against the real `apps/api` server, and until now this
 * script ran neither — see that package's README.md "Why this is not part
 * of any gate" for the reason as it stood through 2026-09-02: a real,
 * user-undecided DIVERGES existed, and CLAUDE.md 鐵律 #1 forbids silently
 * resolving a contract question by wiring a red into the build.
 *
 * The user's technical advisor ruled on 2026-09-03 that this constraint
 * attaches to the CHECK that carries the unresolved finding, not to the
 * package the checks happen to ship from:
 *
 *   - `check.live.test.ts` (route-schema: does the schema Fastify actually
 *     validates against equal the contract's schema?) had two real,
 *     unresolved DIVERGES — `GET /admin/metrics/latency`'s and
 *     `GET /admin/feedback`'s querystring `default`s (see PROGRESS.md's
 *     E04-S073 row). Those were the user's call.
 *   - `check-response-shapes.live.test.ts` (response-shape: does what a
 *     route actually returns match the contract's declared 2xx shape?,
 *     E04-S079) found ZERO unresolved findings — 22 declared JSON 2xx
 *     operations, 21 exercised, all clean (see that file's own printed
 *     coverage report for the 22/21/1-not-covered breakdown; the 1
 *     uncovered route, `POST /transcriptions`, is answered by an existing
 *     test elsewhere — see that file's module doc point 4). Gating this
 *     half forces no red over anyone's unanswered question, so it was
 *     wired in for real from 2026-09-03: a non-zero exit here DOES fail
 *     this whole gate.
 *
 * FIFTH CHECK, ADDED 2026-09-03 (E04-S082, "gate-route-schema") — route-
 * schema is now GATED too
 *
 * E04-S081 resolved both of route-schema's DIVERGES by adding the missing
 * `default`s to `analytics.yaml` (the user's authorized choice — see
 * docs/stories/PENDING_DECISIONS.md's now-resolved entry). With DIVERGES
 * at zero (`SUMMARY: 26 total — MATCH=11 DIVERGES=0 ABSENT=15`, verified
 * on `main`), the reason route-schema was left unenforced is gone, so this
 * story moves it into the gated section below: a non-zero exit from
 * `check.live.test.ts` now DOES fail this whole gate, exactly like
 * response-shape above.
 *
 * ABSENT is deliberately NOT gated by this move, and cannot be by
 * construction: `divergedRoutes()` (`tools/contract-equivalence/src/
 * print-report.ts`) filters strictly on `status === "DIVERGES"`, so an
 * ABSENT route never appears in the array this check asserts is empty.
 * 15 of the 26 routes report ABSENT today — overwhelmingly because no
 * route in this application registers a Fastify `params:` or `response:`
 * schema at all (tracked separately as E04-S077 and E04-S079, both
 * `blocked-team-b` on authorization nobody has given yet). Gating ABSENT
 * would make `main` permanently red on someone else's unanswered
 * question — precisely the failure mode the original observed-only
 * landing (E04-S073) existed to prevent. The full report, ABSENT included,
 * is still printed on every run below.
 *
 * See tools/contract-equivalence/README.md "Both sections are gated" and
 * ROADMAP_TEMP.md 5-xi's 2026-09-03 addenda for the fuller writeup of
 * this split's history.
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
const contractEquivalenceDir = path.join(repoRoot, "tools/contract-equivalence");

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

/* ── Check 3: binding coverage (four states + BOUND-VIA-PARENT) ─────────── */

const coverage = analyzeBindingCoverage(repoRoot, here);

const stateCounts = { "BOUND-L0": 0, "BOUND-L2": 0, TRANSCRIBED: 0, "BOUND-VIA-PARENT": 0, UNBOUND: 0 };
const contractLevelGaps = []; // { yaml, schemas }
const schemaLevelGapsByYaml = []; // { yaml, schemas: [{schema, matchedClass}] }
const unescalated = [];

console.log(
  "\nbinding coverage (BOUND-L0/L2/TRANSCRIBED/BOUND-VIA-PARENT/UNBOUND; see binding-coverage.mjs):",
);
for (const r of coverage) {
  console.log(`  ${r.yaml}${r.contractLevelGap ? "  (CONTRACT-LEVEL GAP — no compat file, no L2, no TRANSCRIBED)" : ""}`);
  const schemaGaps = [];
  for (const s of r.schemas) {
    const c = r.classification.get(s);
    stateCounts[c.state] += 1;
    const suffix = c.state === "BOUND-VIA-PARENT" ? ` (via ${c.parent})` : "";
    console.log(`    ${c.state.padEnd(16)} ${s}${suffix}`);
    if (c.state === "UNBOUND") {
      const key = `${r.yaml}::${s}`;
      const entry = UNBOUND_SCHEMA_ALLOWLIST.find((e) => e.match(r.yaml, s));
      if (entry) {
        schemaGaps.push({ schema: s, class: entry.class });
      } else {
        unescalated.push(key);
      }
    }
  }
  if (r.contractLevelGap) {
    contractLevelGaps.push({ yaml: r.yaml, schemas: r.schemas });
  } else if (schemaGaps.length > 0) {
    schemaLevelGapsByYaml.push({ yaml: r.yaml, schemas: schemaGaps });
  }
}

console.log(
  `\nstate counts: BOUND-L0=${stateCounts["BOUND-L0"]}  BOUND-L2=${stateCounts["BOUND-L2"]}  ` +
    `TRANSCRIBED=${stateCounts.TRANSCRIBED}  BOUND-VIA-PARENT=${stateCounts["BOUND-VIA-PARENT"]}  ` +
    `UNBOUND=${stateCounts.UNBOUND}`,
);
if (stateCounts.TRANSCRIBED > 0) {
  console.log(
    "  TRANSCRIBED is printed, not allowlist-eligible, and not counted as bound: unlock condition is " +
      '"reclassified to MATCH or DIVERGES once the L2-EQ check lands" (a follow-up story, not yet numbered, ' +
      "that compares each registered/transcribed route schema against its yaml at runtime-registration time).",
  );
}

// ── Two-section gap report: contract-level ("no gate exists for this whole
// contract") is a different severity from schema-level ("this one schema in
// an otherwise-gated contract has no gate"). ──────────────────────────────

console.log("\n── Contract-level gaps (no compat file, no BOUND-L2, no TRANSCRIBED for the WHOLE contract) ──");
if (contractLevelGaps.length === 0) {
  console.log("  none");
} else {
  for (const g of contractLevelGaps) {
    const entry = UNBOUND_SCHEMA_ALLOWLIST.find((e) => e.match(g.yaml, g.schemas[0]));
    console.log(`  ${g.yaml}  (${g.schemas.length} schemas, class: ${entry ? entry.class : "UNESCALATED"})`);
  }
}

console.log("\n── Schema-level gaps (this schema, inside an otherwise-gated contract, has no gate) ──");
if (schemaLevelGapsByYaml.length === 0) {
  console.log("  none");
} else {
  for (const g of schemaLevelGapsByYaml) {
    console.log(`  ${g.yaml}`);
    const byClass = new Map();
    for (const { schema, class: cls } of g.schemas) {
      const list = byClass.get(cls) ?? [];
      list.push(schema);
      byClass.set(cls, list);
    }
    for (const [cls, schemas] of byClass) {
      console.log(`    [${cls}] ${schemas.join(", ")}`);
    }
  }
}

console.log(`\nallowlist entries: ${UNBOUND_SCHEMA_ALLOWLIST.length} classes`);

if (unescalated.length > 0) {
  failed = true;
  console.error(
    `\nFAIL: ${unescalated.length} UNBOUND schema(s) are not covered by any class in ` +
      `unbound-schema-allowlist.mjs:\n`,
  );
  for (const key of unescalated) console.error(`  ${key}`);
} else {
  console.log("\nPASS: every UNBOUND schema is covered by a class in unbound-schema-allowlist.mjs.");
}

/* ── Check 4a/4b: contract-equivalence live checks (2026-09-03) ──────────── */

/**
 * Runs one `tools/contract-equivalence` vitest file directly (never through
 * turbo — see tools/mutate.mjs's own module doc for why a warm turbo cache
 * would manufacture a false negative here), returns its exit code and
 * combined stdout+stderr. Never throws on a non-zero exit: both call sites
 * below decide for themselves whether that exit code affects `failed`.
 */
function runContractEquivalenceVitest(testFile, extraArgs = []) {
  const vitestBin = path.join(contractEquivalenceDir, "node_modules/.bin/vitest");
  try {
    const stdout = execFileSync(vitestBin, ["run", testFile, ...extraArgs], {
      encoding: "utf8",
      cwd: contractEquivalenceDir,
    });
    return { exitCode: 0, output: stdout };
  } catch (error) {
    return {
      exitCode: typeof error.status === "number" ? error.status : 1,
      output: `${error.stdout ?? ""}${error.stderr ?? ""}`,
    };
  }
}

console.log(`\n${"=".repeat(78)}`);
console.log("response-shape (gated) — tools/contract-equivalence, E04-S079/E04-S073 follow-up");
console.log("=".repeat(78));
const responseShape = runContractEquivalenceVitest("src/check-response-shapes.live.test.ts");
console.log(responseShape.output);
if (responseShape.exitCode !== 0) {
  failed = true;
  console.error(
    `FAIL: response-shape check exited ${responseShape.exitCode} — a route's actual response body ` +
      "diverged from its contract's declared 2xx shape (see the route + field diff above).",
  );
} else {
  console.log("PASS: response-shape check exited 0.");
}

console.log(`\n${"=".repeat(78)}`);
console.log("route-schema (gated) — tools/contract-equivalence, E04-S073/E04-S081/E04-S082");
console.log("=".repeat(78));
const routeSchema = runContractEquivalenceVitest("src/check.live.test.ts", [
  "-t",
  "every registered route's Fastify schema equals its contract operation's schema",
]);
console.log(routeSchema.output);
if (routeSchema.exitCode !== 0) {
  failed = true;
  console.error(
    `FAIL: route-schema check exited ${routeSchema.exitCode} — the schema Fastify actually validates ` +
      "a request against diverged from its contract operation's schema for the same field (see the " +
      "route + field diff above).",
  );
} else {
  console.log(
    "PASS: route-schema check exited 0 — zero DIVERGES. (E04-S081 resolved the only two known ones by " +
      "adding their querystring defaults to analytics.yaml; see docs/stories/PENDING_DECISIONS.md's " +
      "resolved entry and PROGRESS.md's E04-S081 row.)",
  );
}
console.log(
  "NOTE (does not affect the verdict above): 15 of the 26 routes report ABSENT — no runtime " +
    "params/response schema exists to compare against the contract's, tracked as E04-S077 " +
    "(params) and E04-S079 (response), both blocked-team-b on authorization nobody has given yet. " +
    'ABSENT can never fail this check: divergedRoutes() (print-report.ts) filters strictly on ' +
    'status === "DIVERGES", so an ABSENT route never enters the array asserted empty above. Gating ' +
    "ABSENT would make this gate permanently red on someone else's unanswered authorization question " +
    "— exactly what E04-S073's original observed-only landing existed to prevent — so it stays " +
    "printed for visibility only, never gated, and must never be silenced into an allowlist.",
);

/* ── Verdict ─────────────────────────────────────────────────────────────── */

if (failed) {
  console.error("\nFAIL: contract gate failed (see above).");
  process.exit(1);
}

console.log("\nPASS: contract gate passed.");
process.exit(0);
