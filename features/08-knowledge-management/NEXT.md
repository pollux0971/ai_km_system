# 08 · knowledge-management — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04 回填,待 `/phase-done`) |
| 進行中 | 無 |
| 下一個 | phase-2 |

**提醒**:phase-1 全綠只證明 `apps/web` 的**瀏覽器端 mock 層**照規格行為。知識管理**沒有**
接上任何後端(鐵律 5)。任何對外的說法都必須帶上「目前對 mock」。

## 下一個 phase 的 gate

**phase-2(上傳與文件狀態接真 API,對應 I4)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [ ] 整合:I2 通過(web 提問),再 I3(部門授權真的來自身分)。I4 排在它們後面,不可跳
- [ ] **契約:`contracts/openapi/` 目前完全沒有 knowledge 路徑。** 需要一份新的
      `knowledge.yaml`(知識庫 CRUD + 文件清單 + 上傳 + 文件狀態)。
      **新 endpoint + 新 schema = 使用者拍板**(CLAUDE.md 決策權表),要先走 `/decide` 開
      ADR `proposed`,再進 `docs/DECISIONS_NEEDED.md`
- [ ] 契約:文件層 `visibleToRoles` 的語意(它跟知識庫層的 `visibleToRoles` 是「取交集」
      還是「文件層覆蓋」?Deny-Wins 怎麼套?)——這是產品行為未定義,**使用者級**
- [ ] 依賴:`05-ingestion` phase-3(async worker、真正的失敗原因落庫)。目前
      `apps/worker-ingestion` 是 0 行

**phase-3(知識庫頁面本身的 Gherkin)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 環境:features 的 runner 要有瀏覽器層(協調者決定是加 jsdom,還是把 Playwright 的
      `knowledge-*.spec.ts` 掛成 `@e2e` job 的機器對應物)。**worker 不得自己加依賴**

## Gate 未滿足時

**phase-2 卡在「沒有契約」**:不要為了往前走就自己造一份 `knowledge.yaml`(鐵律 1)。
也**不要**在 mock 層繼續長功能來假裝進度——那正是 DEVELOPMENT_POLICY 禁止的
「以 mock 假裝 production path 已完成」。

gate 未滿足時**可以先做**的:

1. 把跨知識庫守門的另外四份(`retryDocumentProcessing` / `archive` / `unarchive` /
   `updateKnowledgeBaseDocumentVisibleRoles`,`knowledge-documents.ts:336/413/428/500`)
   用一個 `Scenario Outline` 補進 phase-1.feature——同一個 phase 內新增場景,不開編號
   (GHERKIN_WORKFLOW §4)。這不需要任何 gate。
2. 把「封存／取消封存是兩個互斥檢視」補成場景(`listKnowledgeBaseDocuments(id, true)`),
   目前只有 vitest 覆蓋。
3. 寫 phase-2 的 ADR 草稿(`/decide`),把契約缺口與 `visibleToRoles` 語意兩題送進
   `docs/DECISIONS_NEEDED.md`——**這是使用者可以立刻解除的阻塞**,`/sprint` 要標出來。

gate 未滿足時**不可以**先做的:碰 `apps/api`、`services/*`、`db/*`(Team B 範圍,本資料夾
沒有授權),或動 `contracts/`。

## 完成後

phase-2 完成即解鎖 I4「從 UI 上傳一份文件,看到它排隊／處理中／可問」——那需要
`05-ingestion` phase-3 與 `12-audit-observability` phase-2 同時到位。
phase-3 完成後,`10-admin-console` 與 `11-app-shell` 的頁面層回填可以共用同一套瀏覽器接法。
