import { describe, expect, it } from "vitest";
import { detectGpu, type ExecImpl } from "./gpu-detect.js";

describe("detectGpu", () => {
  it("parses a single-GPU nvidia-smi CSV line", async () => {
    const exec: ExecImpl = async () => ({
      stdout: "NVIDIA GeForce GTX 1650, 4096\n",
    });
    const result = await detectGpu(exec);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.gpus).toEqual([{ name: "NVIDIA GeForce GTX 1650", vramMiB: 4096 }]);
    }
  });

  it("parses multiple GPUs (one per line)", async () => {
    const exec: ExecImpl = async () => ({
      stdout: "NVIDIA GeForce GTX 1650, 4096\nNVIDIA GeForce RTX 4070, 12282\n",
    });
    const result = await detectGpu(exec);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.gpus).toHaveLength(2);
      expect(result.gpus[1]).toEqual({ name: "NVIDIA GeForce RTX 4070", vramMiB: 12282 });
    }
  });

  it("reports unavailable (not a crash) when nvidia-smi is missing/errors", async () => {
    const exec: ExecImpl = async () => {
      throw Object.assign(new Error("spawn nvidia-smi ENOENT"), { code: "ENOENT" });
    };
    const result = await detectGpu(exec);
    expect(result.available).toBe(false);
    if (!result.available) {
      expect(result.reason).toContain("nvidia-smi");
    }
  });

  it("reports unavailable when nvidia-smi returns empty output", async () => {
    const exec: ExecImpl = async () => ({ stdout: "" });
    const result = await detectGpu(exec);
    expect(result.available).toBe(false);
  });

  it("ignores blank lines in the output", async () => {
    const exec: ExecImpl = async () => ({ stdout: "\nNVIDIA GeForce GTX 1650, 4096\n\n" });
    const result = await detectGpu(exec);
    expect(result.available).toBe(true);
    if (result.available) expect(result.gpus).toHaveLength(1);
  });
});
