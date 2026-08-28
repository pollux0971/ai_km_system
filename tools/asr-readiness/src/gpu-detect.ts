/**
 * GPU/VRAM detection (E12-S030 AC1: "動態輸出 GPU/VRAM...不得寫死").
 *
 * E04-S037("check-specs")是本 story 的 SOFT 依賴,重用其偵測邏輯——spec
 * 明文的 fallback:「未合併時複製最小偵測並註明待合併後去重」。
 * `docs/stories/PROGRESS.md` 顯示 E04-S037 目前仍是 `todo`,所以這裡是
 * 那份最小複製版,不是 import——完整實作、完整測試,不是佔位符。等
 * E04-S037 合併後,可以另外開一個小改動把這個檔案的內容換成 import 它的
 * 偵測模組(spec 自己說的「待合併後去重」);那個去重動作不在本 story
 * 範圍內,本 story 只要求這個偵測現在就要能正確運作。
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecImpl {
  (command: string, args: string[]): Promise<{ stdout: string }>;
}

const defaultExec: ExecImpl = async (command, args) => execFileAsync(command, args);

export interface GpuInfo {
  readonly name: string;
  readonly vramMiB: number;
}

export type GpuDetectionResult =
  | { readonly available: true; readonly gpus: readonly GpuInfo[] }
  | { readonly available: false; readonly reason: string };

/**
 * Runs `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`.
 * Never throws — a missing `nvidia-smi` (no NVIDIA driver, no GPU, or a
 * non-NVIDIA machine) is a normal, expected outcome here, not a tool bug.
 */
export async function detectGpu(exec: ExecImpl = defaultExec): Promise<GpuDetectionResult> {
  let stdout: string;
  try {
    const result = await exec("nvidia-smi", [
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ]);
    stdout = result.stdout;
  } catch (error) {
    return {
      available: false,
      reason: `找不到 nvidia-smi 或執行失敗(${error instanceof Error ? error.message : String(error)})——本機可能沒有 NVIDIA GPU 或未安裝驅動程式。`,
    };
  }

  const gpus: GpuInfo[] = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [rawName, rawVram] = line.split(",").map((part) => part.trim());
      return { name: rawName ?? "unknown", vramMiB: Number(rawVram) || 0 };
    });

  if (gpus.length === 0) {
    return { available: false, reason: "nvidia-smi 執行成功但沒有回報任何 GPU。" };
  }
  return { available: true, gpus };
}
