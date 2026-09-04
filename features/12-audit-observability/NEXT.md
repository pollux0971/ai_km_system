# 12 · audit-observability — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | (無) |
| 進行中 | phase-1(回填,2026-09-04) |
| 下一個 | phase-2 |

**老實話**:phase-2 之前這個能力幾乎是空的。它今天有的是**可觀測性**
(health 兩條路由、trace id 串接、log 衛生),**沒有稽核**——`services/audit` 不存在
(2026-09-04 `ls services/` 確認),契約裡沒有任何稽核 schema,舊規格庫的 E14 章節
本體從未寫完。I7 才是這個資料夾真正落地的地方,那之前它不會長大多少。

## 下一個 phase 的 gate

**phase-2(文件狀態事件進稽核)** 需要全部滿足:

- [ ] 自身:phase-1 `done`
- [ ] 整合:I4 已通過(見 [`docs/01-roadmap.md`](../../docs/01-roadmap.md) 的 I4 表:
      `08-knowledge-management` phase-2、`05-ingestion` phase-3、`06-retrieval` phase-3)
- [ ] 契約:**使用者核可建立 `services/audit/`**。新資料夾是使用者級授權
      (CLAUDE.md 決策權表「新資料夾或 Team B 路徑的授權擴張 → 使用者」)。
      在核可之前不得建立,也不得把稽核事件塞進別的 service 借道。
- [ ] 契約:稽核事件的 schema。`contracts/openapi/` 今天零稽核內容;新 schema 是使用者級。

**phase-3(`services/audit` 從 0 行到可查可匯出)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I6 通過(admin 管部門與群組——稽核要查「誰」,那個「誰」要先是真的)
- [ ] 契約:稽核查詢／匯出的 endpoint。同上,使用者級。

## Gate 未滿足時

**不要自己建 `services/audit/`**,也不要為了「先有東西」把假的稽核事件寫進
`apps/admin/src/lib/audit.ts`——那個檔今天回空是**刻意的誠實**(它自己的註解寫得很清楚:
偽造從未發生過的歷史紀錄,比一個空的目錄嚴重得多)。

gate 未滿足時可以先做的,按價值排序:

1. **把 `GET /v1/health` 登記進契約**。它是本資料夾 phase-1 的主力端點,而
   `tools/contract-equivalence` 對它印 ABSENT(E04-S078)。這是一條 `/decide` +
   使用者拍板就能解除的阻塞,不需要等任何整合點。做完之後這個資料夾的場景就受 L2-EQ 保護。
2. **`services/audit` 的稽核事件 schema 提案**寫成 ADR `proposed`(不寫程式、不建目錄),
   把「誰在何時問了什麼、看到哪些文件、答案引用了什麼」拆成欄位,讓使用者有東西可以批。
   [`docs/01-roadmap.md`](../../docs/01-roadmap.md) 的 I7 那一句就是需求原文。
3. **phase-1 的兩個缺口**(都不需要新授權):`checks.ts` 的 `checkAsr` 對 `whisper-server`
   走真實 fetch 的兩條分支(逾時 → down、非 2xx → down)目前只有 vitest 覆蓋,沒有場景;
   `checkMigrations` 的 pending 偵測同理。要不要補進 phase-1 由 `/phase-done` 的審核者定,
   補的話是同一個 `.feature` 加場景,不開新 phase。

**不可以先做的**:任何在 `services/`、`contracts/` 底下新增檔案的動作。

## 完成後

phase-2 完成後,I4 的「文件狀態」才有可查的軌跡;phase-3 完成即解鎖 I7,
那是「誰在何時問了什麼、看到哪些文件、答案引用了什麼,可查可匯出」第一次成立。
I9(on-prem 部署)也依賴這裡:一台機器上沒有稽核就不能交付給企業。
