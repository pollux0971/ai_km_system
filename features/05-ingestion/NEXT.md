# 05 · ingestion — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | 無 |
| 進行中 | phase-1(回填,2026-09-04 交付待 `/phase-done`) |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(一條把 fixture PDF 索引進 dev DB 的指令,讓 I2 有東西可問)** 需要全部滿足:

- [ ] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 整合:`06-retrieval` phase-2 已把 `retrievalPlugin` 接進 `apps/api` 的 composition root
      ——索引要寫進 **apps/api 實際查詢的那個 store**,否則索引了也問不到
- [ ] 契約:store 的持久化路徑定案(in-memory 重開就沒了;`06-retrieval` phase-3 才把
      sqlite-vec 變成預設)。在那之前 phase-2 的指令只能在同一個 process 裡索引 + 查詢,
      這個限制要寫進場景本文,不能默默帶過

**phase-3(非同步、失敗原因落庫)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I2 通過
- [ ] 授權:`apps/worker-ingestion`(目前 0 行)屬 Team B 路徑,要動它需要使用者授權
      (CLAUDE.md 決策權表「新資料夾或 Team B 路徑的授權擴張」→ 使用者)

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
