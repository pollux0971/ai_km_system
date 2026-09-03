/**
 * ADR 0008 — 所有步驟共用的狀態容器。
 *
 * 三個原則(照範式來源 llm_learning-cards/features/steps/_world.ts):
 * 1. 每個 scenario 一個新的 World,不共用狀態。
 * 2. 需要寫入的東西一律在暫存目錄(SQLite 檔、輸出),絕不動 repo 內的 fixture。
 * 3. `lastResult` / `lastResponse` 存放 When 的產出,Then 從這裡斷言。
 *
 * 本 repo 的接縫有兩種,World 都提供:
 * - **in-process**:直接呼叫 service 函式(`createIngestionService`、`retrieve()`、
 *   `createModelGateway()`),用假 provider(PF1)。這是 phase-1 回填的主要綁法,
 *   與各 service 的 vitest 測試走同一個入口。
 * - **真實 server**:`buildServer()`(apps/api)+ `app.inject()`,不開 port,
 *   每個 scenario 一個 throwaway SQLite。給需要走 HTTP 契約與 plugin 註冊的場景。
 *
 * 通用步驟(common.steps.ts)只讀寫這裡的欄位;各能力的步驟檔負責填值。
 */
import { After, Before, setWorldConstructor, World, type IWorldOptions } from "@cucumber/cucumber";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

/** repo 根目錄(features/steps/ 的上兩層) */
export const ROOT = resolve(import.meta.dirname, "../..");

type Manifest = Record<string, { cmd: string; interactive: boolean; expect?: string; expectExit?: number }>;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout + stderr,方便「it prints …」類的斷言 */
  output: string;
}

export class KmWorld extends World {
  /** 暫存目錄,由 useTempDir 建立;SQLite 檔與輸出放這裡 */
  dir?: string | undefined;
  /** 真實 server(buildServer),由 startServer 建立,After 關閉 */
  app?: FastifyInstance | undefined;
  /** 最近一次 app.inject() 的回應 */
  lastResponse?: LightMyRequestResponse | undefined;
  /** 最近一次 in-process 呼叫的結果,型別由各步驟自己收斂 */
  lastResult: unknown;
  /** 最近一次拋出的錯誤,給「應該被拒絕」的場景用 */
  lastError?: Error | undefined;
  /** 最近一次外部指令(standalone)的結果 */
  lastRun?: RunResult | undefined;
  /** 目前 scenario 所屬 feature 的 tags(Before hook 填) */
  tags: string[] = [];
  /**
   * 假 provider 的呼叫紀錄(各能力的步驟把自己建的 fake 推進來),
   * 給「the generation provider is never called」這類斷言用。
   */
  providerCalls: { component: string; detail?: string }[] = [];
  /** 各能力步驟自由使用的暫存袋(例如 05-ingestion 放 extractedText、hits) */
  bag: Record<string, unknown> = {};

  constructor(options: IWorldOptions) {
    super(options);
  }

  /** 建一個暫存目錄(每個 scenario 一個),回傳路徑 */
  useTempDir(prefix = "km-"): string {
    if (this.dir) return this.dir;
    this.dir = mkdtempSync(join(tmpdir(), prefix));
    return this.dir;
  }

  /** 暫存目錄裡的 SQLite 路徑 */
  dbPath(): string {
    return join(this.useTempDir(), "api.sqlite");
  }

  /** 讀 repo 內的檔案(相對根目錄),bytes */
  readRepoBytes(relPath: string): Uint8Array {
    return new Uint8Array(readFileSync(join(ROOT, relPath)));
  }

  /**
   * 起一個真實的 apps/api server(不開 port)。契約、migration 用 repo 的真實檔案;
   * DB 是本 scenario 的暫存檔;test auth provider 開啟(demo 使用者可登入)。
   */
  async startServer(extra: Record<string, unknown> = {}): Promise<FastifyInstance> {
    if (this.app) return this.app;
    const { buildServer } = await import("../../apps/api/src/server.js");
    this.app = await buildServer({
      dbPath: this.dbPath(),
      enableTestAuthProvider: true,
      loggerStream: { write() {} },
      ...extra,
    });
    await this.app.ready();
    return this.app;
  }

  /** 由 feature 檔的 tag 推出 standalone.json 的 key,例如 @retrieval → 06-retrieval */
  standaloneKey(): string {
    const manifest = this.manifest();
    for (const t of this.tags) {
      const name = t.replace(/^@/, "");
      const hit = Object.keys(manifest).find((k) => k.endsWith(`-${name}`));
      if (hit) return hit;
    }
    throw new Error(`從 tags ${this.tags.join(" ")} 推不出 standalone.json 的 key`);
  }

  manifest(): Manifest {
    return JSON.parse(readFileSync(join(ROOT, "standalone.json"), "utf8")) as Manifest;
  }

  /** 同步執行一個 shell 指令(cwd = repo 根),結果放進 lastRun 並回傳 */
  runCommand(cmd: string, opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): RunResult {
    // standalone 指令要照使用者在終端機的方式跑:不繼承 cucumber 自己的
    // `NODE_OPTIONS=--import=tsx`,否則在別的 cwd 起的子程序會解不到 tsx 而假紅。
    const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env };
    delete env["NODE_OPTIONS"];
    const r = spawnSync(cmd, {
      cwd: ROOT,
      shell: true,
      encoding: "utf8",
      timeout: opts.timeoutMs ?? 180_000,
      env,
    });
    const stdout = r.stdout ?? "";
    const stderr = r.stderr ?? "";
    this.lastRun = { status: r.error ? null : r.status, stdout, stderr, output: stdout + stderr };
    return this.lastRun;
  }

  /** 跑 standalone.json 裡某個 key 的指令。不給 key 就由 tags 推 */
  runStandalone(key?: string): RunResult {
    const k = key ?? this.standaloneKey();
    const entry = this.manifest()[k];
    if (!entry) throw new Error(`standalone.json 裡沒有 ${k}`);
    if (entry.interactive) throw new Error(`${k} 是互動式指令,屬 @manual`);
    return this.runCommand(entry.cmd);
  }

  async cleanup(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = undefined;
    }
    if (this.dir && existsSync(this.dir)) rmSync(this.dir, { recursive: true, force: true });
    this.dir = undefined;
  }
}

setWorldConstructor(KmWorld);

Before(function (this: KmWorld, { pickle }) {
  this.lastResult = undefined;
  this.lastError = undefined;
  this.lastResponse = undefined;
  this.lastRun = undefined;
  this.providerCalls = [];
  this.bag = {};
  this.tags = pickle.tags.map((t) => t.name);
});

After(async function (this: KmWorld) {
  await this.cleanup();
});
