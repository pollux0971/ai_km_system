import { describe, expect, it } from "vitest";
import { F16_MIN_VRAM_MIB, findModels, findWhisperServerBinary, runCheckAsr } from "./check-asr.js";
import type { GpuDetectionResult } from "./gpu-detect.js";

function fakeFileExists(existingPaths: readonly string[]) {
  const set = new Set(existingPaths);
  return async (candidatePath: string): Promise<boolean> => set.has(candidatePath);
}

describe("findWhisperServerBinary", () => {
  it("prefers AI_KM_ASR_SERVER_BIN when it exists", async () => {
    const result = await findWhisperServerBinary({
      env: { AI_KM_ASR_SERVER_BIN: "/custom/whisper-server" },
      fileExists: fakeFileExists(["/custom/whisper-server"]),
    });
    expect(result).toBe("/custom/whisper-server");
  });

  it("falls back to PATH when AI_KM_ASR_SERVER_BIN is unset", async () => {
    const result = await findWhisperServerBinary({
      env: { PATH: "/usr/bin:/usr/local/bin" },
      fileExists: fakeFileExists(["/usr/local/bin/whisper-server"]),
    });
    expect(result).toBe("/usr/local/bin/whisper-server");
  });

  it("looks for the .exe suffix on Windows", async () => {
    const result = await findWhisperServerBinary({
      env: { PATH: "C:\\tools" },
      fileExists: fakeFileExists(["C:\\tools\\whisper-server.exe"]),
      platform: "win32",
    });
    expect(result).toBe("C:\\tools\\whisper-server.exe");
  });

  it("returns null when found nowhere (does not throw)", async () => {
    const result = await findWhisperServerBinary({
      env: { PATH: "/usr/bin" },
      fileExists: fakeFileExists([]),
    });
    expect(result).toBeNull();
  });

  it("ignores AI_KM_ASR_SERVER_BIN if that specific path does not exist, falling back to PATH", async () => {
    const result = await findWhisperServerBinary({
      env: { AI_KM_ASR_SERVER_BIN: "/nope", PATH: "/usr/local/bin" },
      fileExists: fakeFileExists(["/usr/local/bin/whisper-server"]),
    });
    expect(result).toBe("/usr/local/bin/whisper-server");
  });
});

describe("findModels", () => {
  it("reports which quantizations exist independently", async () => {
    const result = await findModels(
      "/models/asr",
      fakeFileExists(["/models/asr/ggml-large-v3-turbo-q5_0.bin"]),
    );
    expect(result).toEqual({ f16: false, q5_0: true });
  });

  it("reports neither found without crashing", async () => {
    const result = await findModels("/models/asr", fakeFileExists([]));
    expect(result).toEqual({ f16: false, q5_0: false });
  });
});

const GPU_1650: GpuDetectionResult = {
  available: true,
  gpus: [{ name: "NVIDIA GeForce GTX 1650", vramMiB: 4096 }],
};
const GPU_4070: GpuDetectionResult = {
  available: true,
  gpus: [{ name: "NVIDIA GeForce RTX 4070", vramMiB: 12282 }],
};
const NO_GPU: GpuDetectionResult = { available: false, reason: "找不到 nvidia-smi" };

describe("runCheckAsr", () => {
  it("AC1: ready — binary + GPU + recommended model all present, recommendation is dynamic per VRAM (q5_0 below threshold)", async () => {
    expect(GPU_1650.available && GPU_1650.gpus[0]!.vramMiB).toBeLessThan(F16_MIN_VRAM_MIB);
    const report = await runCheckAsr({
      detectGpuImpl: async () => GPU_1650,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists([
        "/usr/local/bin/whisper-server",
        "/models/asr/ggml-large-v3-turbo-q5_0.bin",
      ]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("ready");
    expect(report.details.some((d) => d.includes("q5_0"))).toBe(true);
  });

  it("AC1: recommends f16 once VRAM is at/above the threshold (dynamic, not hardcoded to a GPU name)", async () => {
    expect(GPU_4070.available && GPU_4070.gpus[0]!.vramMiB).toBeGreaterThanOrEqual(F16_MIN_VRAM_MIB);
    const report = await runCheckAsr({
      detectGpuImpl: async () => GPU_4070,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists([
        "/usr/local/bin/whisper-server",
        "/models/asr/ggml-large-v3-turbo.bin",
      ]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("ready");
    expect(report.details.some((d) => d.includes("建議量化:f16"))).toBe(true);
  });

  it("AC1/AC3: not_ready — missing binary, with an actionable next step, no crash", async () => {
    const report = await runCheckAsr({
      detectGpuImpl: async () => GPU_1650,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists(["/models/asr/ggml-large-v3-turbo-q5_0.bin"]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("not_ready");
    expect(report.nextSteps.length).toBeGreaterThan(0);
  });

  it("AC1/AC3: not_ready — missing all model files, with an actionable next step", async () => {
    const report = await runCheckAsr({
      detectGpuImpl: async () => GPU_1650,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists(["/usr/local/bin/whisper-server"]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("not_ready");
    expect(report.nextSteps.some((s) => s.includes("Hugging Face"))).toBe(true);
  });

  it("degraded — no GPU detected but binary+a model exist (CPU fallback)", async () => {
    const report = await runCheckAsr({
      detectGpuImpl: async () => NO_GPU,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists([
        "/usr/local/bin/whisper-server",
        "/models/asr/ggml-large-v3-turbo-q5_0.bin",
      ]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("degraded");
    expect(report.nextSteps.some((s) => s.includes("CPU"))).toBe(true);
  });

  it("degraded — GPU suggests f16 but only q5_0 is on disk (usable, not optimal)", async () => {
    const report = await runCheckAsr({
      detectGpuImpl: async () => GPU_4070,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists([
        "/usr/local/bin/whisper-server",
        "/models/asr/ggml-large-v3-turbo-q5_0.bin",
      ]),
      modelsDir: "/models/asr",
    });
    expect(report.level).toBe("degraded");
  });

  it("AC4: idempotent — two consecutive runs against the same fake environment produce the same report", async () => {
    const deps = {
      detectGpuImpl: async () => GPU_1650,
      env: { PATH: "/usr/local/bin" },
      fileExists: fakeFileExists([
        "/usr/local/bin/whisper-server",
        "/models/asr/ggml-large-v3-turbo-q5_0.bin",
      ]),
      modelsDir: "/models/asr",
    };
    const first = await runCheckAsr(deps);
    const second = await runCheckAsr(deps);
    expect(second).toEqual(first);
  });

  it("regression: never reports 'ready' when a required piece is actually missing (a stale/incorrect fake environment would catch this)", async () => {
    const report = await runCheckAsr({
      detectGpuImpl: async () => NO_GPU,
      env: {},
      fileExists: fakeFileExists([]),
      modelsDir: "/models/asr",
    });
    expect(report.level).not.toBe("ready");
  });
});
