/**
 * E13-S019 Security AC: `adminListMessagesWithFeedback`/`adminGetMessage`
 * (cross-owner reads, `@ai-km/service-conversation`) must never be called
 * from anywhere other than this package's own admin-role-gated route file.
 * A static source-tree scan, not a checklist someone has to remember to
 * update — a future route that imports either function directly (bypassing
 * `requireAnyRole`) makes this test fail regardless of where it is added.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function resolveRepoRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (statSync(path.join(dir, "db", "migrations"), { throwIfNoEntry: false })?.isDirectory()) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 db/migrations 目錄(從 ${from} 逐層往上找)。`);
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "coverage"]);

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(full);
    }
  }
  return out;
}

const ALLOWED_CALLER = path.join("services", "feedback", "src", "routes", "admin-feedback.ts");
const OWN_DEFINITION_FILE = path.join(
  "services",
  "conversation",
  "src",
  "repository",
  "admin-read.repository.ts",
);

describe("admin-read call-site scan (E13-S019 Security AC)", () => {
  it("adminListMessagesWithFeedback/adminGetMessage are called ONLY from the admin-role-gated route file", () => {
    const root = resolveRepoRoot();
    const files = walkTsFiles(root);
    const callSitePattern = /\b(adminListMessagesWithFeedback|adminGetMessage)\s*\(/;
    const violations: string[] = [];

    for (const file of files) {
      const relative = path.relative(root, file);
      if (relative === OWN_DEFINITION_FILE) continue; // the function's own definition, not a call
      if (relative.endsWith(".test.ts")) continue; // tests may exercise the function directly
      const content = readFileSync(file, "utf8");
      if (callSitePattern.test(content) && relative !== ALLOWED_CALLER) {
        violations.push(relative);
      }
    }

    expect(violations).toEqual([]);
  });

  it("non-vacuity: the allowed caller file itself DOES call both functions (the scan finds real usage, not nothing)", () => {
    const root = resolveRepoRoot();
    const content = readFileSync(path.join(root, ALLOWED_CALLER), "utf8");
    expect(content).toMatch(/adminListMessagesWithFeedback\s*\(/);
    expect(content).toMatch(/adminGetMessage\s*\(/);
  });
});
