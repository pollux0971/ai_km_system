# 11 · app-shell — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-05,`@e2e`／`@manual` 由使用者親手走查確認)、phase-2(2026-09-05) |
| 進行中 | **phase-3**(2026-09-05 派出;測試 agent 的紅規格 `222f663` 已在 branch,開發 agent 在做綠) |
| 下一個 | **phase-4**(點引用的抽屜顯示伺服器給的那段原文;2026-09-05 新增)。其後才是 phase-5(斷點;gate 未滿足——要 DOM 驗收環境) |

## phase-4 的 gate(2026-09-05 新增,技術顧問裁決)

- [ ] 自身:phase-3 已進 main
- [ ] 整合:**`07-generation/phase-2b` 已進 main** —— 抽屜要讀的 `citation.text` 由它加進契約
- [x] 契約:`Citation` 加必填 `text` 已由顧問裁准(ADR 0016 追加段),**不需要使用者**

**I2 的 `@e2e` 在本 phase 之後才做得到。** `phase-3` 綠了**不等於**可以驗收
——那句話協調者說錯過一次(PITFALLS 坑 19 第四次),寫在這裡免得再說一次。

> 2026-09-05 更正:這張表原本停在「已完成:無 / 進行中:phase-1」,而 phase-1 與 phase-2
> 都已在 `FEATURE.md` 的 phase 表標 `done`。**狀態的唯一來源是 `FEATURE.md` 的 phase 表**
> (GHERKIN_WORKFLOW §1),本檔落後於它就是文件腐爛;`/sprint` 讀的是本檔,所以它落後會直接
> 導出錯的排程建議。

## 下一個 phase 的 gate

**phase-2(引用可點、開原文段落面板;跨視窗同步進自動場景)** 需要全部滿足:

- [ ] 自身:phase-1 狀態為 `done`
- [ ] 整合:I2 的其他 phase 就位——`06-retrieval` phase-2(接進 apps/api composition root)、
      `07-generation` phase-2(引用回填)、`03-conversation` phase-2(訊息帶 citations)。
      沒有真的答案與引用,就沒有面板可開,寫出來的場景會是憑空猜的介面。
- [ ] 契約:跨視窗同步要進自動場景,得先解掉 `FEATURE.md`「待協調」第 2 條
      (`packages/api-client` 補副檔名,或 `features/tsconfig.json` 改 Bundler 解析)。
      這是協調者一個 commit 的事,不需要使用者。
- [ ] 共用檔:`standalone.json` 的 `11-app-shell` 改成非互動指令(「待協調」第 1 條),
      否則 `/phase-done` 的「單獨執行 exit 0」這一項永遠沒有東西可跑。

**phase-3(斷點與元件層 UI 狀態)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 環境:一個能跑 DOM 的驗收環境(features 的 runner 加 jsdom,或把這些場景交給
      `tests/e2e` 的 Playwright)。**這是新依賴,不是 worker 自己能加的**,要協調者或使用者定。

## phase-3 的 gate(2026-09-05 新增,顧問裁決)

- [x] 整合:`03-conversation/phase-2` 已 `done`(2026-09-05)——伺服器會自動產生帶 `citations` 的助理訊息
- [x] 整合:`05-ingestion/phase-2b` 已 `done`——`pnpm dev` 起來時 store 有東西,畫面才問得出帶引用的答案
- [x] `/feature` 預先確認(顧問 2026-09-05):`grep 模擬: features/{03,11}/phase-1.feature`,
      **凡是斷言 mock 觸發器行為的場景,隨 mock 一起刪**,commit body 要列出刪了哪幾條與為什麼
      ——**它們描述的是鷹架不是產品**。`08` 那套 `file-processing` 的觸發器**不動**(已查證,不同一套)。

**Playwright / 真瀏覽器那一層(本 phase 不做,寫成 gate)**:

`docs/integration/i2-ask-in-web.feature` 最終要有一條 **`@browser`** 場景,對著
**帶 `AI_KM_DEV_SEED_FIXTURE=true` 的真 dev server、真瀏覽器**——**那才是 PITFALLS 坑 19 缺的那一層**。

本輪不做的理由是量出來的,不是推的:

- CI 的 `e2e` job **自 2026-08-28 就是紅的**,歷史原因 `connect ECONNREFUSED 127.0.0.1:4000`
  ——**API 沒在跑**。那與使用者 2026-09-05 走查時撞到的是**同一件事**。
- Playwright 要 `tests/e2e/e2e-locked.sh` 的跨 worktree flock(一次只能一個)。

**所以先修 e2e job 的紅,再談 `@browser` 場景**;在那之前 jsdom 那條是必做的替代,
**但它替代不了「真瀏覽器」**——這句要留著,免得日後有人以為 jsdom 綠了就等於人做得到
(那正是坑 19 的形狀)。

## Gate 未滿足時

**phase-2 卡在 I2**:不要先照猜的介面寫引用面板的場景——`06`/`07`/`03` 的 phase-2 還沒定
出「引用長什麼樣、點下去拿到什麼」,現在寫的會整份重寫。

可以先做、且**不需要任何 gate** 的:

- 「待協調」第 2 條落地後,把 `conversation-events.ts` 的三個行為補成自動場景:
  (a) 另一個視窗建立的對話會送到這個視窗;(b) 重連後重播的同一個 id 不會被套用兩次;
  (c) 連線 open → 中斷 → 回來時狀態序列是 `open, reconnecting, open`(header 那句
  「同步連線中斷,重新連線中…」就是讀這個狀態)。三個都在 node 裡跑得動,假的
  `EventSourceFactory` 是 `conversation-events.test.ts` 本來就在用的注入點,不是新 mock。
- 把 `standalone.json` 改好之後,加一個「這個能力的單獨執行指令跑得起來」的場景,
  用 `common.steps.ts` 已有的 `the standalone command for this capability is run` +
  `it exits with status 0`。**現在不能加**——那條通用步驟對 `interactive: true` 的項目
  直接拋錯。

**不可以先做的**:不要為了讓 UI 場景「有東西可測」而在步驟裡自己塞一個 DOM 假環境。
features 的 runner 沒有 jsdom 是有意的;要 DOM 就走 gate,不從側門進來。

## 完成後

phase-2 完成,I2 的「點引用打開原文段落」這一塊才算齊——那是 I2 驗收場景裡使用者親手要做的
最後一個動作。phase-3 完成後,`docs/design/app-shell-m3.md` 那張斷點表才有機器證據,
在那之前它是設計文件,不是規格。
