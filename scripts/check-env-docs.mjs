#!/usr/bin/env node
/**
 * E01-S028 AC4 — the runbook's env table must document exactly the env var
 * keys that actually exist across apps/api, apps/admin and apps/web's
 * .env.example files (commented-out optional vars count too — they are
 * still real, documented knobs a deployer might set). Neither side may
 * silently drift from the other: a key added to a .env.example without a
 * runbook update fails this, and so does a runbook key that names a
 * variable no .env.example mentions.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ENV_EXAMPLE_FILES = ["apps/api/.env.example", "apps/admin/.env.example", "apps/web/.env.example"];
const RUNBOOK = "docs/runbooks/deploy-on-prem.md";

function keysFromEnvExample(relPath) {
  const text = readFileSync(path.join(repoRoot, relPath), "utf8");
  const keys = new Set();
  for (const line of text.split("\n")) {
    const m = /^#?\s*([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (m) keys.add(m[1]);
  }
  return keys;
}

function keysFromRunbook(relPath) {
  const text = readFileSync(path.join(repoRoot, relPath), "utf8");
  const start = text.indexOf("<!-- APP_ENV_TABLE_START -->");
  const end = text.indexOf("<!-- APP_ENV_TABLE_END -->");
  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${relPath} must contain an <!-- APP_ENV_TABLE_START --> ... <!-- APP_ENV_TABLE_END --> ` +
        "marked section for the apps/*/.env.example-matching table (deployment-only vars like " +
        "AI_KM_PUBLIC_HOST belong outside it — they have no apps/*/.env.example counterpart).",
    );
  }
  const section = text.slice(start, end);
  const keys = new Set();
  // Env table rows: | `AI_KM_FOO` | ... |
  for (const m of section.matchAll(/\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/g)) {
    keys.add(m[1]);
  }
  return keys;
}

const envKeys = new Set();
for (const f of ENV_EXAMPLE_FILES) {
  for (const k of keysFromEnvExample(f)) envKeys.add(k);
}
const runbookKeys = keysFromRunbook(RUNBOOK);

const missingFromRunbook = [...envKeys].filter((k) => !runbookKeys.has(k)).sort();
const extraInRunbook = [...runbookKeys].filter((k) => !envKeys.has(k)).sort();

if (missingFromRunbook.length > 0 || extraInRunbook.length > 0) {
  if (missingFromRunbook.length > 0) {
    console.error(`Keys in .env.example files but MISSING from ${RUNBOOK}:`);
    for (const k of missingFromRunbook) console.error(`  - ${k}`);
  }
  if (extraInRunbook.length > 0) {
    console.error(`Keys documented in ${RUNBOOK} but not in any .env.example:`);
    for (const k of extraInRunbook) console.error(`  - ${k}`);
  }
  process.exit(1);
}

console.log(`OK: ${RUNBOOK}'s env table matches ${envKeys.size} keys across ${ENV_EXAMPLE_FILES.join(", ")}.`);
