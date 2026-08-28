/**
 * `check-asr` (E12-S030 AC1): dynamic three-state readiness report for
 * GPU/VRAM, the `whisper-server` binary, and downloaded model files.
 * Never writes/downloads anything — purely diagnostic, so re-running it
 * is naturally idempotent (AC4) as long as the environment itself
 * doesn't change between runs.
 */
import { access } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectGpu, type ExecImpl, type GpuDetectionResult } from "./gpu-detect.js";
import { exitCodeForLevel, formatReport, type ReadinessLevel, type ReadinessReport } from "./report.js";

export const MODEL_FILENAMES = {
  f16: "ggml-large-v3-turbo.bin",
  q5_0: "ggml-large-v3-turbo-q5_0.bin",
} as const;

/**
 * F16 needs roughly 2.5–3 GiB of VRAM in practice (ADR 0004 §3); q5_0
 * fits comfortably under 1 GiB. 4500 MiB leaves headroom above the F16
 * high estimate for the OS/desktop's own VRAM use. This is a threshold
 * evaluated against the ACTUAL DETECTED VRAM value (AC1: "依 VRAM 建議
 * f16／q5_0；不得寫死") — not a hardcoded GPU name/model lookup table.
 */
export const F16_MIN_VRAM_MIB = 4500;

async function defaultFileExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveRepoRoot(from: string = fileURLToPath(import.meta.url)): string {
  let dir = path.dirname(from);
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`找不到 repo root(從 ${from} 逐層往上找 pnpm-workspace.yaml,未找到)。`);
}

export interface FindBinaryDeps {
  readonly env: NodeJS.ProcessEnv;
  readonly fileExists: (candidatePath: string) => Promise<boolean>;
  readonly platform?: NodeJS.Platform;
}

/**
 * `AI_KM_ASR_SERVER_BIN` env var, else a `whisper-server`(`.exe` on
 * Windows) found on `PATH`. Uses `path.win32`/`path.posix` explicitly
 * per the (possibly injected, for tests) target platform rather than
 * Node's OS-native `path` — `path.delimiter`/`path.join` otherwise
 * resolve to whatever OS this tool happens to be RUNNING on, which is
 * wrong when checking a Windows PATH string from a non-Windows dev/CI
 * machine (caught by this file's own test suite).
 */
export async function findWhisperServerBinary(deps: FindBinaryDeps): Promise<string | null> {
  const envPath = deps.env.AI_KM_ASR_SERVER_BIN;
  if (envPath && (await deps.fileExists(envPath))) return envPath;

  const targetPlatform = deps.platform ?? process.platform;
  const isWindows = targetPlatform === "win32";
  const targetPath = isWindows ? path.win32 : path.posix;

  const pathEnv = deps.env.PATH ?? deps.env.Path ?? "";
  const dirs = pathEnv.split(targetPath.delimiter).filter((entry) => entry.length > 0);
  const binaryName = isWindows ? "whisper-server.exe" : "whisper-server";

  for (const dir of dirs) {
    const candidate = targetPath.join(dir, binaryName);
    if (await deps.fileExists(candidate)) return candidate;
  }
  return null;
}

export interface ModelAvailability {
  readonly f16: boolean;
  readonly q5_0: boolean;
}

export async function findModels(
  modelsDir: string,
  fileExists: (candidatePath: string) => Promise<boolean>,
): Promise<ModelAvailability> {
  const [f16, q5_0] = await Promise.all([
    fileExists(path.join(modelsDir, MODEL_FILENAMES.f16)),
    fileExists(path.join(modelsDir, MODEL_FILENAMES.q5_0)),
  ]);
  return { f16, q5_0 };
}

export interface CheckAsrDeps {
  detectGpuImpl?: (exec?: ExecImpl) => Promise<GpuDetectionResult>;
  execImpl?: ExecImpl;
  env?: NodeJS.ProcessEnv;
  fileExists?: (candidatePath: string) => Promise<boolean>;
  modelsDir?: string;
}

export async function runCheckAsr(deps: CheckAsrDeps = {}): Promise<ReadinessReport> {
  const env = deps.env ?? process.env;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const modelsDir = deps.modelsDir ?? path.join(resolveRepoRoot(), "models", "asr");
  const detectGpuFn = deps.detectGpuImpl ?? detectGpu;

  const gpu = await detectGpuFn(deps.execImpl);
  const binaryPath = await findWhisperServerBinary({ env, fileExists });
  const models = await findModels(modelsDir, fileExists);

  const details: string[] = [];
  const nextSteps: string[] = [];

  if (gpu.available) {
    const primary = gpu.gpus[0]!;
    details.push(`GPU:${primary.name}(${primary.vramMiB} MiB VRAM)`);
  } else {
    details.push(`GPU:未偵測到(${gpu.reason})`);
  }

  const recommended: keyof typeof MODEL_FILENAMES =
    gpu.available && (gpu.gpus[0]?.vramMiB ?? 0) >= F16_MIN_VRAM_MIB ? "f16" : "q5_0";
  details.push(`建議量化:${recommended}(${MODEL_FILENAMES[recommended]})`);

  if (binaryPath) {
    details.push(`whisper-server:${binaryPath}`);
  } else {
    details.push("whisper-server:未找到");
    nextSteps.push(
      "依 models/asr/README.md 建置 whisper.cpp 的 whisper-server,或設定 AI_KM_ASR_SERVER_BIN 指向現有的 binary 路徑。",
    );
  }

  const foundModels = [models.f16 && "f16", models.q5_0 && "q5_0"].filter(Boolean) as string[];
  if (foundModels.length > 0) {
    details.push(`模型檔:找到 ${foundModels.join("、")}`);
  } else {
    details.push("模型檔:未找到");
    nextSteps.push(
      `依 models/asr/README.md 從 Hugging Face(ggerganov/whisper.cpp)下載 ${MODEL_FILENAMES[recommended]} 放進 models/asr/。`,
    );
  }

  const hasRecommendedModel = models[recommended];

  let level: ReadinessLevel;
  if (!binaryPath || foundModels.length === 0) {
    level = "not_ready";
  } else if (!gpu.available || !hasRecommendedModel) {
    level = "degraded";
    if (!gpu.available) {
      nextSteps.push("未偵測到 GPU——whisper-server 會退回 CPU 模式,辨識速度會明顯變慢。");
    }
    if (!hasRecommendedModel) {
      nextSteps.push(
        `目前 VRAM 建議使用 ${recommended}(${MODEL_FILENAMES[recommended]}),但該檔案不存在,會退回使用另一個已下載的量化版本。`,
      );
    }
  } else {
    level = "ready";
  }

  const summary =
    level === "ready" ? "ASR 環境就緒" : level === "degraded" ? "ASR 環境可用,但非最佳設定" : "ASR 環境尚未就緒";

  return { level, summary, details, nextSteps };
}

async function main(): Promise<void> {
  const report = await runCheckAsr();
  console.log(formatReport(report));
  process.exitCode = exitCodeForLevel(report.level);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
