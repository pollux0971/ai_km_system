/**
 * `verify-asr` (E12-S030 AC2/AC3): sends
 * `fixtures/sample-zh-en.wav` to a running `whisper-server` `/inference`,
 * normalizes the result (OpenCC cn→twp) and checks keyword hit-rate
 * (≥80%) + traditional-only. Three distinct, actionable failure states
 * (missing fixture / missing model / sidecar unreachable) plus a
 * "responded but quality too low" state — never a crash (AC3).
 *
 * This function's OWN logic (request shape, scoring, branching) is unit
 * tested against a fake sidecar (`testing/fake-sidecar.ts`) — that is
 * NOT integration evidence for a real whisper-server (Testing Boundary /
 * Anti-hallucination Guard: "不得宣稱 ASR 已驗證而實際只跑過 fake"). The
 * real L3 run is recorded in docs/stories/E12-S030.md.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { findModels, resolveRepoRoot } from "./check-asr.js";
import { exitCodeForLevel, formatReport, type ReadinessReport } from "./report.js";
import { isTraditionalOnly, keywordHitRate, toTraditional } from "./normalize.js";

const DEFAULT_PROMPT = "以下是台灣繁體中文與英文混合的工作對話。";
export const DEFAULT_HIT_RATE_THRESHOLD = 0.8;

export type VerifyAsrOutcome =
  | { readonly kind: "pass"; readonly text: string; readonly hitRate: number; readonly isTraditional: boolean; readonly elapsedMs: number }
  | { readonly kind: "fail_quality"; readonly text: string; readonly hitRate: number; readonly isTraditional: boolean; readonly elapsedMs: number }
  | { readonly kind: "missing_fixture"; readonly message: string }
  | { readonly kind: "missing_expected"; readonly message: string }
  | { readonly kind: "missing_model"; readonly message: string }
  | { readonly kind: "sidecar_unreachable"; readonly message: string };

export function outcomeToReport(outcome: VerifyAsrOutcome, threshold: number): ReadinessReport {
  const pct = (value: number) => `${(value * 100).toFixed(0)}%`;

  switch (outcome.kind) {
    case "pass":
      return {
        level: "ready",
        summary: "verify-asr 通過",
        details: [
          `辨識文字:${outcome.text}`,
          `關鍵詞命中率:${pct(outcome.hitRate)}(門檻 ${pct(threshold)})`,
          "繁體檢查:通過",
          `耗時:${outcome.elapsedMs} ms`,
        ],
        nextSteps: [],
      };
    case "fail_quality":
      return {
        level: "not_ready",
        summary: "verify-asr 失敗:辨識品質未達標準",
        details: [
          `辨識文字:${outcome.text}`,
          `關鍵詞命中率:${pct(outcome.hitRate)}(門檻 ${pct(threshold)})`,
          `繁體檢查:${outcome.isTraditional ? "通過" : "失敗(仍含簡體字元)"}`,
          `耗時:${outcome.elapsedMs} ms`,
        ],
        nextSteps: [
          "確認 fixtures/sample-zh-en.wav 的實際內容與 fixtures/expected.json 的關鍵詞清單一致。",
          "確認 whisper-server 啟動時的 --prompt/-l 設定與 verify-asr 一致。",
        ],
      };
    case "missing_fixture":
      return {
        level: "not_ready",
        summary: "缺少測試音檔",
        details: [outcome.message],
        nextSteps: ["依 tools/asr-readiness/fixtures/README.md 錄製並放置 sample-zh-en.wav(不進 git)。"],
      };
    case "missing_expected":
      return {
        level: "not_ready",
        summary: "缺少 expected.json",
        details: [outcome.message],
        nextSteps: ["依 tools/asr-readiness/fixtures/README.md 建立 expected.json 的關鍵詞清單。"],
      };
    case "missing_model":
      return {
        level: "not_ready",
        summary: "缺少模型檔",
        details: [outcome.message],
        nextSteps: ["先執行 check-asr 並依它的下一步指引下載模型。"],
      };
    case "sidecar_unreachable":
      return {
        level: "not_ready",
        summary: "無法連線 whisper-server",
        details: [outcome.message],
        nextSteps: ["先用 scripts/asr-server.sh(或 .ps1)啟動 sidecar,或確認 --host/--port 與 verify-asr 的目標一致。"],
      };
  }
}

function parseExpectedKeywords(raw: unknown): string[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { keywords?: unknown }).keywords)) {
    return (raw as { keywords: unknown[] }).keywords.filter((item): item is string => typeof item === "string");
  }
  return [];
}

async function defaultFileExists(candidatePath: string): Promise<boolean> {
  try {
    await readFile(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function defaultReadFileBuffer(candidatePath: string): Promise<Buffer> {
  return readFile(candidatePath);
}

async function defaultReadJsonFile(candidatePath: string): Promise<unknown> {
  return JSON.parse(await readFile(candidatePath, "utf8"));
}

export interface VerifyAsrDeps {
  serverUrl?: string;
  fixturePath?: string;
  expectedPath?: string;
  modelsDir?: string;
  fetchImpl?: typeof fetch;
  fileExists?: (candidatePath: string) => Promise<boolean>;
  readFileBuffer?: (candidatePath: string) => Promise<Buffer>;
  readJsonFile?: (candidatePath: string) => Promise<unknown>;
  now?: () => number;
  language?: string;
  prompt?: string;
  hitRateThreshold?: number;
}

export async function runVerifyAsr(deps: VerifyAsrDeps = {}): Promise<VerifyAsrOutcome> {
  const fileExists = deps.fileExists ?? defaultFileExists;
  const readFileBuffer = deps.readFileBuffer ?? defaultReadFileBuffer;
  const readJsonFile = deps.readJsonFile ?? defaultReadJsonFile;
  const now = deps.now ?? (() => Date.now());
  const fetchImpl = deps.fetchImpl ?? fetch;
  const threshold = deps.hitRateThreshold ?? DEFAULT_HIT_RATE_THRESHOLD;
  const serverUrl = deps.serverUrl ?? "http://127.0.0.1:8178";

  const repoRoot = resolveRepoRoot();
  const fixturePath = deps.fixturePath ?? path.join(repoRoot, "tools", "asr-readiness", "fixtures", "sample-zh-en.wav");
  const expectedPath = deps.expectedPath ?? path.join(repoRoot, "tools", "asr-readiness", "fixtures", "expected.json");
  const modelsDir = deps.modelsDir ?? path.join(repoRoot, "models", "asr");

  if (!(await fileExists(fixturePath))) {
    return { kind: "missing_fixture", message: `找不到 ${fixturePath}。` };
  }
  if (!(await fileExists(expectedPath))) {
    return { kind: "missing_expected", message: `找不到 ${expectedPath}。` };
  }
  const models = await findModels(modelsDir, fileExists);
  if (!models.f16 && !models.q5_0) {
    return { kind: "missing_model", message: `${modelsDir} 沒有任何模型檔。` };
  }

  const keywords = parseExpectedKeywords(await readJsonFile(expectedPath));
  const wavBuffer = await readFileBuffer(fixturePath);

  const form = new FormData();
  form.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "sample-zh-en.wav");
  form.append("language", deps.language ?? "zh");
  form.append("prompt", deps.prompt ?? DEFAULT_PROMPT);
  form.append("response_format", "json");
  form.append("temperature", "0");

  const startedAt = now();
  let response: Response;
  try {
    response = await fetchImpl(`${serverUrl}/inference`, { method: "POST", body: form });
  } catch (error) {
    return {
      kind: "sidecar_unreachable",
      message: `連線 ${serverUrl} 失敗:${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!response.ok) {
    return { kind: "sidecar_unreachable", message: `${serverUrl} 回應 HTTP ${response.status}。` };
  }

  const body = (await response.json()) as { text?: unknown };
  const rawText = typeof body.text === "string" ? body.text : "";
  const elapsedMs = now() - startedAt;

  const text = toTraditional(rawText);
  const hitRate = keywordHitRate(text, keywords);
  const traditional = isTraditionalOnly(text);

  if (hitRate >= threshold && traditional) {
    return { kind: "pass", text, hitRate, isTraditional: traditional, elapsedMs };
  }
  return { kind: "fail_quality", text, hitRate, isTraditional: traditional, elapsedMs };
}

async function main(): Promise<void> {
  const outcome = await runVerifyAsr();
  const report = outcomeToReport(outcome, DEFAULT_HIT_RATE_THRESHOLD);
  console.log(formatReport(report));
  process.exitCode = exitCodeForLevel(report.level);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
