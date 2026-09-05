# 05 · ingestion — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04)、phase-2(2026-09-05),兩個都獨立驗收 PASS |
| 進行中 | phase-2b(2026-09-05 派出) |
| 下一個 | phase-3(非同步、失敗原因落庫;gate 未滿足:等 I2 通過) |

## 下一個 phase 的 gate

**phase-2(一條把 fixture PDF 索引進 dev DB 的指令,讓 I2 有東西可問)** 需要全部滿足:

- [x] 自身:phase-1 `done`(2026-09-04)
- [x] 整合:I1 已通過(2026-09-03)
- [x] 整合:`06-retrieval` phase-2 已把 `retrievalPlugin` 接進 `apps/api` 的 composition root
      (2026-09-04)——索引要寫進 **apps/api 實際查詢的那個 store**,否則索引了也問不到
- [x] 契約:store 的持久化路徑定案 —— **[ADR 0015](../../docs/adr/0015-composition-root-owns-the-retrieval-store.md)
      (2026-09-05,協調者裁,顧問不在)**:composition root 自己持有 store 並交給
      `retrievalPlugin`,用既有的 `registerSandboxSeeder` 樣式餵它;`enforceEmbeddingVersion`
      由 composition root **顯式打開**(E06-S026 明文:plugin 不替 injected service 決定這個值);
      **in-memory 重開就沒了這個限制要寫進場景本文,不是只寫在註解裡**;持久化留給
      `06-retrieval` phase-3(I4)。**四條 gate 全滿足,已派出。**

**phase-3(非同步、失敗原因落庫)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I2 通過
- [ ] 授權:`apps/worker-ingestion`(目前 0 行)屬 Team B 路徑,要動它需要使用者授權
      (CLAUDE.md 決策權表「新資料夾或 Team B 路徑的授權擴張」→ 使用者)

## phase-2b 的 gate(2026-09-05 新增,顧問裁決)

**phase-2b(`pnpm dev` 起來時 fixture 已在索引裡)** 需要:

- [x] 自身:phase-2 `done`(2026-09-05)
- [x] 方向已裁:**旗標 seeder**(`AI_KM_DEV_SEED_FIXTURE=1`,由 `apps/api` 的 `dev` script 帶)。
      顧問否決了另外兩條:**HTTP 上傳是 I4 的交付**(`knowledge.yaml`、`08` phase-2),
      拉進 I2 就是跳整合點;**sqlite-vec(`06-retrieval/phase-3`)拉前面**才是真的「一條 CLI」,
      但它同時改變「第二個 server 是空的」的語意(檔案共享),**那是 06 phase-3 自己該重寫的場景**,
      不在 I2 中途做。
- [x] 實作約束(顧問指定):seeder **必須走與測試步驟同一條 `app.ingestion` 路徑**,
      不另開程式碼路徑;啟動時 **log 印出索引了哪份文件、幾個 chunk**,讓使用者看得到 store 不是空的;
      `NODE_ENV=production` 加旗標 → **拒絕啟動**,照 `apps/api/src/config.ts` 既有
      `AI_KM_DEV_TRIGGERS`/`AI_KM_TEST_SANDBOX` 的形狀與措辭,理由寫
      「**它把固定 fixture 塞進生產索引**」。

**跨行程 CLI 不在這個 phase**:今天的 store 是**行程內記憶體**,外部行程灌不進去。
真的「一條 CLI」要等 `06-retrieval/phase-3`(sqlite-vec 成為預設持久 store,掛在 I4)。
本 phase 交的是「`pnpm dev` 起來就有東西可問」,不是「任何時候都能從外面灌」。

**這個 phase 存在的理由**:見 `FEATURE.md` 的「為什麼有 phase-2b」——
所有自動檢查都綠,而人做不到,因為它們走的不是同一個入口(§5.4)。

## Gate 未滿足時

**phase-2 卡在 `06-retrieval` phase-2**:不要為了先做而在 `apps/api` 另外接一個只給 ingestion
用的 store——那會變成「索引寫到 A、查詢讀 B」的兩份真相,正是 I1 之前那批接線缺陷的形狀。

gate 未滿足時可以先做的(都不碰實作、不碰 Team B 路徑):

- 把 `IngestionEmptyDocumentError` 的場景寫成紅的(見 FEATURE.md 開放問題),等真實文件出現。
- 把 in-memory store「先驗證全部再寫任何一筆」的窄突變反向驗證補起來(FEATURE.md 開放問題第一條)。
- 等 `standalone.json` 的 `--` 修好之後,把本資料夾的單獨執行指令實際跑一次確認 exit 0。

**phase-3 等使用者授權**:`apps/worker-ingestion` 沒有授權之前,不要先在 `services/ingestion`
裡寫一個「假的佇列」——那不是提前準備,是把待決策變成既成事實。

## 完成後

phase-2 完成後,I2 的「問一個關於已索引文件的問題」就有真的資料可問;
phase-3 完成後解鎖 I4 的「從 UI 上傳、看到狀態、壞檔會說原因」——
本能力的四種拒絕(空抽取、加密、無部門、跨部門重匯)就是那個「說原因」的內容來源。
