import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Spawns the real entrypoint. AC6 is not "the server refuses to serve" but
 * "the server never listens at all", which only a real process can prove.
 */
function runMain(env: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      ["--import", "tsx", path.join(API_ROOT, "src", "main.ts")],
      { cwd: API_ROOT, env: { ...process.env, ...env }, timeout: 20_000 },
      (error, _stdout, stderr) => {
        resolve({ code: typeof error?.code === "number" ? error.code : child.exitCode, stderr });
      },
    );
  });
}

describe("main entrypoint production guard (AC6)", () => {
  it("exits non-zero without listening when production + AI_KM_TEST_SANDBOX=true", async () => {
    const { code, stderr } = await runMain({
      NODE_ENV: "production",
      AI_KM_TEST_SANDBOX: "true",
      AI_KM_API_PORT: "4399",
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain("AI_KM_TEST_SANDBOX");
    expect(stderr.toLowerCase()).not.toContain("listening");
  }, 30_000);

  it("exits non-zero without listening when production + AI_KM_DEV_TRIGGERS=true", async () => {
    const { code, stderr } = await runMain({
      NODE_ENV: "production",
      AI_KM_DEV_TRIGGERS: "true",
      AI_KM_API_PORT: "4398",
    });
    expect(code).not.toBe(0);
    expect(stderr).toContain("AI_KM_DEV_TRIGGERS");
  }, 30_000);

  it("exits non-zero on an invalid port rather than falling back to a default", async () => {
    const { code, stderr } = await runMain({ NODE_ENV: "production", AI_KM_API_PORT: "not-a-port" });
    expect(code).not.toBe(0);
    expect(stderr).toContain("AI_KM_API_PORT");
  }, 30_000);
});
