import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultGenerateOne, runGenerate, SPEC_NAMES } from "../../scripts/generate.mjs";

const REAL_SPEC_DIR = path.resolve(import.meta.dirname, "../../../../contracts/openapi");

describe("runGenerate", () => {
  it("generates a .d.ts for every present spec and lists the rest as missing, without failing", async () => {
    const specDir = mkdtempSync(path.join(tmpdir(), "api-client-specs-"));
    const outDir = mkdtempSync(path.join(tmpdir(), "api-client-out-"));
    writeFileSync(path.join(specDir, "core.yaml"), "irrelevant to the fake generator");
    writeFileSync(path.join(specDir, "auth.yaml"), "irrelevant to the fake generator");
    const generateOne = async (specPath: string) => `// generated from ${path.basename(specPath)}`;

    const { generated, missing } = await runGenerate({
      specDir,
      outDir,
      specNames: ["core", "auth", "conversations", "transcriptions"],
      generateOne,
    });

    expect(generated).toEqual(["core", "auth"]);
    expect(missing).toEqual(["conversations", "transcriptions"]);
    expect(readFileSync(path.join(outDir, "core.d.ts"), "utf8")).toBe("// generated from core.yaml");
    expect(readFileSync(path.join(outDir, "auth.d.ts"), "utf8")).toBe("// generated from auth.yaml");
    expect(existsSync(path.join(outDir, "conversations.d.ts"))).toBe(false);
    expect(existsSync(path.join(outDir, "transcriptions.d.ts"))).toBe(false);
  });

  it("returns generated:[] and every name as missing when no spec files exist yet, still exit-0-shaped", async () => {
    const specDir = mkdtempSync(path.join(tmpdir(), "api-client-specs-empty-"));
    const outDir = mkdtempSync(path.join(tmpdir(), "api-client-out-empty-"));

    const { generated, missing } = await runGenerate({
      specDir,
      outDir,
      generateOne: async () => "unused",
    });

    expect(generated).toEqual([]);
    expect(missing).toEqual(SPEC_NAMES);
  });

  it("runs the real openapi-typescript codegen against this repo's actual contracts/openapi/core.yaml", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "api-client-real-out-"));

    const { generated, missing } = await runGenerate({
      specDir: REAL_SPEC_DIR,
      outDir,
      specNames: ["core"],
      generateOne: defaultGenerateOne,
    });

    expect(generated).toEqual(["core"]);
    expect(missing).toEqual([]);
    const output = readFileSync(path.join(outDir, "core.d.ts"), "utf8");
    expect(output).toContain("export type paths");
    expect(output).toContain("Pagination");
    expect(output).toContain("auto-generated");
  });
});
