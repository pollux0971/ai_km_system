import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCheck } from "../../scripts/check.mjs";

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

function commitAll(dir: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
}

function makeRepo(): { repoRoot: string; specDir: string; outDir: string } {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "api-client-check-"));
  initGitRepo(repoRoot);
  const specDir = path.join(repoRoot, "contracts");
  const outDir = path.join(repoRoot, "generated");
  mkdirSync(specDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });
  return { repoRoot, specDir, outDir };
}

describe("runCheck", () => {
  it("passes (drifted:false) when the committed generated output already matches the spec", async () => {
    const { repoRoot, specDir, outDir } = makeRepo();
    writeFileSync(path.join(specDir, "core.yaml"), "spec-v1");
    writeFileSync(path.join(outDir, "core.d.ts"), "// generated content v1");
    commitAll(repoRoot);

    const result = await runCheck({
      specDir,
      outDir,
      repoRoot,
      specNames: ["core"],
      generateOne: async () => "// generated content v1",
    });

    expect(result.drifted).toBe(false);
  });

  it("fails (drifted:true) when the committed generated file is stale relative to the spec (would otherwise stay green forever)", async () => {
    const { repoRoot, specDir, outDir } = makeRepo();
    writeFileSync(path.join(specDir, "core.yaml"), "spec-v2 with a new field");
    // Committed generated output reflects an older spec version — this is the drift case.
    writeFileSync(path.join(outDir, "core.d.ts"), "// generated content v1 (stale)");
    commitAll(repoRoot);

    const result = await runCheck({
      specDir,
      outDir,
      repoRoot,
      specNames: ["core"],
      generateOne: async () => "// generated content v2 (fresh)",
    });

    expect(result.drifted).toBe(true);
    expect(result.diff).toContain("core.d.ts");
  });

  it("fails when a newly-addable spec's generated file was never committed at all", async () => {
    const { repoRoot, specDir, outDir } = makeRepo();
    writeFileSync(path.join(specDir, "core.yaml"), "spec-v1");
    commitAll(repoRoot);

    const result = await runCheck({
      specDir,
      outDir,
      repoRoot,
      specNames: ["core"],
      generateOne: async () => "// generated content v1",
    });

    expect(result.drifted).toBe(true);
  });
});
