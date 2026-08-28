/**
 * AC5: "`.gitignore` 規則以測試驗證(模型與 wav 不可能被 commit)". Uses
 * the real `git check-ignore` against the repo's actual root
 * `.gitignore` — not a string-content check of the file, which would
 * only prove the right LINE exists, not that git actually honors it
 * (e.g. a later, more specific rule could still un-ignore a path).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

function resolveRepoRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 repo root(從 ${from} 逐層往上找)。`);
}

async function isGitIgnored(relativePath: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["check-ignore", "-q", relativePath], { cwd: resolveRepoRoot() });
    return true; // exit 0 = ignored
  } catch (error) {
    const exitCode = (error as { code?: number }).code;
    if (exitCode === 1) return false; // explicitly NOT ignored
    throw error; // any other exit code (e.g. 128, not a git repo) is a real error
  }
}

describe(".gitignore — models/asr and fixtures wav files are never committable (AC5)", () => {
  it("ignores a .bin model file under models/asr/", async () => {
    expect(await isGitIgnored("models/asr/ggml-large-v3-turbo.bin")).toBe(true);
    expect(await isGitIgnored("models/asr/ggml-large-v3-turbo-q5_0.bin")).toBe(true);
  });

  it("ignores a .wav fixture under tools/asr-readiness/fixtures/", async () => {
    expect(await isGitIgnored("tools/asr-readiness/fixtures/sample-zh-en.wav")).toBe(true);
  });

  it("does NOT ignore this story's own tracked source files (the rule is scoped, not a blanket ignore)", async () => {
    expect(await isGitIgnored("tools/asr-readiness/package.json")).toBe(false);
    expect(await isGitIgnored("models/asr/README.md")).toBe(false);
  });

  it("does NOT ignore expected.json (keywords are committed; only the audio itself is not)", async () => {
    expect(await isGitIgnored("tools/asr-readiness/fixtures/expected.json")).toBe(false);
  });
});
