/**
 * 11-app-shell phase-3 步驟。見 features/11-app-shell/phase-3.feature 檔頭。
 *
 * 這個資料夾的 cucumber runner 沒有 jsdom(phase-1.feature 檔頭已經寫過這件事),
 * 而這個 phase 要守的東西(助理氣泡實際渲染的文字、引用面板實際渲染的列數、
 * 相關內容面板實際渲染的附件列)非過一次 DOM 不可——FEATURE.md/NEXT.md 已經把
 * 這個 phase 的 gate 訂成「用 jsdom 為必做」。apps/web 自己已經有 126 個
 * jsdom vitest 檔,所以這裡選的機制是:每個場景的 When 步驟直接把
 * `pnpm --filter @ai-km/web exec vitest run <file> -t "<test 名稱>"` 當一個
 * 外部指令跑(`this.runCommand`,common.steps.ts 通用機制,`standalone.json`
 * 那句「the standalone command for this capability is run」用的是同一個
 * KmWorld.runCommand),決定性的斷言(氣泡文字逐字等於伺服器的 content、面板列數
 * 等於 citations.length)寫在 vitest 檔本身
 * (apps/web/src/app/(app)/conversations/[id]/_components/
 * message-thread.server-answer.test.tsx)——那裡才有真的 DOM 可以量。這裡的
 * Then 只重用 common.steps.ts 既有的「it exits with status {int}」,不新增
 * 通用步驟。
 */
import { Given, When } from "@cucumber/cucumber";
import type { KmWorld } from "./_world.js";

// 相對於 apps/web(不是 repo 根)——`pnpm --filter @ai-km/web exec` 把子行程的
// cwd 換成套件目錄本身,路徑前面不能再疊一層 "apps/web/",不然 vitest 會在
// apps/web/apps/web/... 底下找不到檔案(exit 1、"No test files found",看起來
// 像測試本身壞了,其實是路徑算錯——2026-09-05 實測踩到)。
const SERVER_ANSWER_TEST_FILE = "src/app/(app)/conversations/[id]/_components/message-thread.server-answer.test.tsx";

function runVitestCheck(world: KmWorld, testNamePattern: string) {
  // -t 用子字串比對(vitest 預設是 regex,但這裡的名稱都沒有 regex 特殊字元),
  // 每個場景只鎖一個 it() 名稱,不會不小心連跑到隔壁的測試。
  world.runCommand(`pnpm --filter @ai-km/web exec vitest run "${SERVER_ANSWER_TEST_FILE}" -t "${testNamePattern}"`, {
    timeoutMs: 120_000,
  });
}

// 這四句 Given 只是給讀者看的情境敘述(伺服器端已經做了什麼),不操作 World——
// 真正的 fixture 全部封裝在上面那個 vitest 檔裡,同一件事沒有第二份副本。
Given("a person has already asked a question in a conversation whose reply the server will generate itself, with real citations", function (this: KmWorld) {
  // no-op — 見檔頭說明
});

Given("a person has already sent a message and the server has finished handling it", function (this: KmWorld) {
  // no-op — 見檔頭說明
});

Given("a server-generated reply carries two citations", function (this: KmWorld) {
  // no-op — 見檔頭說明
});

Given("a person sends a message with one attachment in this browser tab", function (this: KmWorld) {
  // no-op — 見檔頭說明
});

When("the vitest check for {string} is run", function (this: KmWorld, testNamePattern: string) {
  runVitestCheck(this, testNamePattern);
});
