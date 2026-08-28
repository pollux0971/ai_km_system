import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runGenerate } from "./generate.mjs";

/**
 * Regenerates `src/generated/*` and diffs it against what's committed under `outDir`.
 * A non-empty diff means the committed generated files have drifted from
 * `contracts/openapi/*.yaml` — this is the L2 contract gate.
 */
export async function runCheck({ specDir, outDir, repoRoot, specNames, generateOne }) {
  await runGenerate({ specDir, outDir, specNames, generateOne });
  // `git diff` ignores untracked files by default, which would hide a spec whose
  // generated .d.ts was never committed at all. `-N` (intent-to-add) makes any such
  // new file show up as an addition in the diff below, without actually staging content.
  execFileSync("git", ["add", "-N", "--", outDir], { cwd: repoRoot });
  try {
    execFileSync("git", ["diff", "--exit-code", "--", outDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    return { drifted: false, diff: "" };
  } catch (err) {
    return { drifted: true, diff: typeof err.stdout === "string" ? err.stdout : "" };
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(scriptsDir, "..");
  const { drifted, diff } = await runCheck({
    specDir: path.resolve(packageRoot, "../../contracts/openapi"),
    outDir: path.resolve(packageRoot, "src/generated"),
    repoRoot: path.resolve(packageRoot, "../.."),
  });
  if (drifted) {
    console.error("[api-client check] src/generated is out of date with contracts/openapi:\n" + diff);
    process.exit(1);
  }
  console.log("[api-client check] src/generated matches contracts/openapi.");
  process.exit(0);
}
