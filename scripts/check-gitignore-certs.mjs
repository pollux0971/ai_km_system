#!/usr/bin/env node
/**
 * E01-S028 Security AC: "憑證私鑰不進 git（.gitignore 規則測試）". Mirrors
 * tools/asr-readiness/src/gitignore.test.ts's approach (E12-S030) — uses the
 * REAL `git check-ignore` against the repo's actual root .gitignore, not a
 * string-content check of the file (which would only prove the right LINE
 * exists, not that git actually honors it — a later, more specific rule
 * could still un-ignore a path). Not a vitest file: infra/docker and
 * scripts/ are not part of the pnpm workspace's test-runnable packages, so
 * this is a standalone script with the same assertion rigor instead.
 */
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

function resolveRepoRoot(from = fileURLToPath(import.meta.url)) {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not find repo root (walked up from ${from})`);
}

const repoRoot = resolveRepoRoot();

function isGitIgnored(relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], { cwd: repoRoot });
    return true; // exit 0 = ignored
  } catch (error) {
    if (error.status === 1) return false; // explicitly NOT ignored
    throw error; // any other exit code (e.g. 128, not a git repo) is a real error
  }
}

const cases = [
  ["infra/docker/certs/server.key", true],
  ["infra/docker/certs/server.pem", true],
  ["infra/docker/caddy-data/pki/whatever.crt", true],
  ["infra/docker/caddy-config/autosave.json", true],
  // Scoping proof — this rule must not become a blanket ignore of infra/docker/.
  ["infra/docker/docker-compose.yml", false],
  ["infra/docker/Caddyfile", false],
  ["infra/docker/README.md", false],
];

let failures = 0;
for (const [relPath, expected] of cases) {
  const actual = isGitIgnored(relPath);
  try {
    assert.equal(actual, expected, `${relPath}: expected ignored=${expected}, got ${actual}`);
    console.log(`OK   ${relPath} (ignored=${actual})`);
  } catch (err) {
    console.error(`FAIL ${err.message}`);
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll .gitignore cert/key checks passed.");
