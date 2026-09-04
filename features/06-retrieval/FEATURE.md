# 06 · retrieval

## 一句話

一個人問問題時,系統只從他看得到的文件裡找,找出來的每一段都能指回原文,而且找錯人的資料
會炸不會靜默。

## owner

待指派(回填由技術顧問 ai-km-3a 完成,作為其他資料夾的參考實作)。

## 範圍

- 授權在檢索之前:`retrieve(question, scope, topK)` 收 branded `RetrievalScope` 作為輸入,
  不在內部推導、不建過渡對應表(E04-S062 設計約束)
- 向量庫的 scope 前置過濾(in-memory 與 sqlite-vec 兩種實作;sqlite-vec 用 partition key,
  不是 JOIN 後濾)
- 洩漏偵測(`assertNoScopeLeak`):store 若忽略 scope,拋 `ScopeLeakError` 而非靜默過濾
- embedding 身分守門:索引與查詢的 model/dimensions 不符 → 拒絕檢索(E06-S026,嚴格級)
- MMR reranking(E04-S016/S074):只在已授權候選集內重排,不捏造、不越界
- hit 的 offsets 指向原始文件全文

## 不在範圍

- 從身分推導 scope(→ `02-authorization`,E04-S009 仍 blocked)
- 寫入向量(→ `05-ingestion`)
- context 組裝與引用回填(→ `07-generation`)
- 真模型 embedding(PF3,→ `04-model-gateway`,等 E04-S037)

## 來源

- 契約:無直接 HTTP 契約(in-process 接縫,ADR 0007);向量記錄型別在 `services/retrieval/src/vector/store.ts`
- 舊 story(素材):E04-S058、S060、S061、S062、S066、S067、S074、S016、E06-S026、E06-S043
- 規格庫:`SOURCE_BASELINE.md` §10 Principle 3「Authorization Before Retrieval,禁止 retrieve-everything-then-hide」

## 單獨執行

```bash
pnpm --filter @ai-km/features accept -- --tags '@retrieval and @standalone and not @manual'
```

預期輸出:`9 scenarios (9 passed)`。全部 in-process、假 embedding provider(PF1)、in-memory store,
不需要 DB、不需要模型、不開 port。

## 依賴

**phase-1(回填)**:只依賴 `services/retrieval/src`、`services/model-gateway/src`(deterministic provider)。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(接進 apps/api、被 07 呼叫) | I1 通過(已)、`02-authorization` phase-1 | I2 需要 apps/api 註冊 retrievalPlugin;scope 來源要真的 |
| phase-3(sqlite-vec 成為 composition root 的 store) | E04-S067(已 approved) | `RetrievalHit.embedding` 要能回傳,MMR 才不用重算 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/retrieval/src` |
| 測試 | vitest 8 檔 + cucumber `phase-1.feature` 9 場景 + `tools/mutate.mjs` | |
| 級別 | **嚴格** | 觸及資料可見性;失敗模式(排序錯、洩漏)靜默 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)授權檢索、Deny-Wins、洩漏偵測、offsets、身分守門、MMR | I1 | done | 2026-09-03 |
| 2 | 接進 apps/api composition root,供 07 與 03 呼叫 | I2 | done | 2026-09-04 |
| 3 | sqlite-vec 成為預設持久 store | I4 | todo | |

**phase-2 狀態細節(2026-09-04)**:測試 agent 交出**紅**的 `phase-2.feature`(4 個場景)
+ `retrieval.steps.ts` 新增步驟。依 ADR 0014,composition root 這一輪只需要用 demo 使用者
的固定 `dept:eng` scope,不必等 `02-authorization` phase-2。等協調者確認、merge,IMPLEMENT
階段才把 `retrievalPlugin` 比照 `conversationPlugin`/`feedbackPlugin` 的條件註冊樣式接進
`apps/api/src/server.ts`。

## phase-2 提案(紅,2026-09-04)

四個場景,全部卡在同一個根因斷言——`app.retrieval` 在真實 `buildServer()` 的父實例上不存在
——這是刻意的設計(GHERKIN_WORKFLOW §5.2:第一條炸的斷言決定紅的意義)。每個場景的第二條
`Then` 今天因此被 cucumber skip(不是 fail),等 IMPLEMENT 接上 retrievalPlugin 之後才會被
真的跑到:

| 場景 | 第二條 Then 驗證什麼(接上後才會跑到) |
|---|---|
| The retrieval seam has not been wired into the real API server yet | (只有一條 Then,就是根因本身) |
| Once wired, the real server's seam must refuse an empty question instead of silently searching everything | 空問題經過真實 server 的 seam 仍被 `RetrievalServiceError` 拒絕 |
| Once wired, the real server's seam must never invent a citation for data that has not been indexed yet | 沒有任何資料被索引時,seam 誠實回傳空陣列,不捏造命中 |
| I2's scope is fixed to dept:eng for every signed-in person, not derived from their real department — 這是移除條件 | demo-user(資訊部)與 demo-maintenance(維修部)透過同一個 seam 問同一個問題,結果必須完全一樣——因為 I2 期間 scope 是寫死的,不看真部門 |

**⚠️ 寫場景時發現的限制,誠實記錄**:`retrievalPlugin` 沒指定 `service`/`store` 時,預設會建
一個全新的**空**記憶體 store(`services/retrieval/src/service.ts:238`)。也就是說,即使
phase-2 用最簡單的方式(比照 `conversationPlugin`,不帶任何 options)把 `retrievalPlugin`
接進 `server.ts`,`app.retrieval` 存在之後也**沒有任何機制**能讓它端出真的索引資料——
`05-ingestion/phase-2`(把 fixture PDF 索引進 dev DB)是另一個資料夾的工作,而 `apps/api` 今天
沒有任何測試用的 retrieval store 注入通道(不像 `dbPath`/`migrationsDir` 那樣有
`BuildServerOptions` 覆寫欄位)。

因此,場景刻意**不**斷言「能不能真的拿到某部門的 chunk」與「offsets 是否指回原文」——這兩個
使用者語言層級的斷言(工單原文列出的「拿到的每一段都指得回原文」「拿不到別人部門的東西」)
即使在 phase-2 正確實作之後也不會變綠,寫了就是一個永遠沒有「可變綠」路徑的檢查點。改用
「不捏造」(空 store 誠實回空,不是隨便給一個命中)與「兩個真部門不同的人得到完全相同的待遇」
(證明 scope 真的是寫死的,不是巧合地都對)這兩個在 phase-2 wiring 完成後就能真正變綠、且不
依賴任何尚未存在的 seed 通道的斷言替代。**待協調**:要不要在 phase-2 或另開一個 phase 補一個
`apps/api` 的測試用 retrieval store/service 注入欄位(比照 `dbPath`/`migrationsDir`),讓
「拿到的每一段都指得回原文」「跨部門 Deny-Wins」這兩個更貼近使用者語言的斷言真的能在 06-retrieval
自己的 phase 裡驗證,而不必等到 I2 整合點(`docs/integration/i2-ask-in-web.feature`)才第一次
被涵蓋。

**沒有發現 ADR 0014 說不通的裁定**:五條約束(簽名不變、不在內部推導、不建過渡對應表、固定值只
活在 composition root、場景要明寫暫時限制)在今天的程式碼狀態下彼此不衝突——衝突反而是「要怎麼
在沒有 seed 通道的情況下驗證資料層行為」這個 ADR 0014 沒有講到的實作細節,已記錄如上。

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own | `plugin.test.ts`: AC-RS1 ★ app.retrieval 對 SIBLING 可見;AC-RS3 Deny-Wins |
| Deny-Wins — a person in another department gets nothing | `plugin.test.ts`: AC-RS3;`service.test.ts`: AC-R1 |
| An empty scope returns nothing rather than everything | `service.test.ts`: AC-R2 空授權範圍 = 拒絕全部;`scope.test.ts`: 空的 allowedScopeKeys |
| The authorised person gets the right chunk first | `service.test.ts`: AC-R1 排序最佳者在前 |
| Hit offsets point into the original document | `service.test.ts`: AC-R4 offsets 對應原始文件全文 |
| Leak detection is active | `service.test.ts`: AC-R3 洩漏偵測是主動的 |
| An empty question is refused | `service.ts` 第 247 行守門(`RetrievalServiceError`) |
| A store indexed by a different embedding model is refused | `embedding-identity.test.ts`: AC3/AC5 在 retrieve() 這一層也成立;AC6 訊息含兩個版本 |
| Reranking never invents a hit and never leaves the scope | `retrieve-with-reranking.test.ts`: permutation-and-subset;MMR diversity(E04-S074);reranks WITHIN scope |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept -- --tags '@retrieval and @phase-1'` 9/9。
- 反向驗證(2026-09-03,回填時做):`authorization/scope.ts` 的 `buildScopePredicate` 改為
  `return () => true` → 4 個場景紅,紅的原因是最後一道防線 `ScopeLeakError: 檢索結果含有 N 筆
  超出授權範圍的資料(scopeKey: dept:eng)…前置過濾未生效`,Deny-Wins 與「空 scope 回空」兩條
  都炸在這裡;還原後 sha256 相同、9/9 綠。這證明兩層(前置過濾 + 後置斷言)缺一層另一層會響。
- `@manual`:無。

## 開放問題

- 反向驗證 (b) 把整條 scope 謂詞拿掉,紅在 store 層的 `assertNoScopeLeak`(`vector/store.ts:414`);`service.ts:272` 那份同層防線
  這次沒被執行到。「兩層缺一層另一層會響」目前只驗證了一層;下一次用窄突變(只拿掉 store 層的 post-assert)證明 service 層那份。
- phase-2 的 composition root 要不要對 `retrieve()` 加 topK 上限?契約沒定,見 `02-authorization` 落地後再議。
- sqlite-vec 路徑的 phase-1 場景目前沒有回填(`tests/sqlite-vec-store.integration.test.ts` 11 條仍是 vitest),
  phase-3 時以 `Scenario Outline` 兩種 store 各跑一次。
- **(2026-09-04,phase-2 提案新增)`apps/api` 沒有測試用的 retrieval 資料注入通道**:見上方
  「phase-2 提案(紅)」段的完整說明。IMPLEMENT 階段接上 `retrievalPlugin` 之後,`app.retrieval`
  預設仍是空 store;要驗證「拿到的引用真的指回原文」「跨部門 Deny-Wins」這兩個更貼近使用者語言的
  性質,需要協調者決定是否比照 `BuildServerOptions.dbPath`/`migrationsDir` 的模式,加一個測試用
  的 retrieval store/service 覆寫欄位,還是把這兩個性質留給 I2 整合點
  (`docs/integration/i2-ask-in-web.feature`,屆時 05-ingestion/phase-2 已經有真資料可用)去涵蓋。

## 待協調

- **(2026-09-04,phase-2 提案)`apps/api` 的測試用 retrieval 資料注入通道**:見上「開放問題」——
  這是 IMPLEMENT phase-2 之前需要協調者拍板的一件事,牽涉 `apps/api/src/server.ts` 與
  `BuildServerOptions` 的形狀,不是測試 agent(本輪只寫規格)能單方面決定的。
- 其餘沒有需要協調者修改共用檔的事項:本資料夾這一輪只新增 `phase-2.feature` 與
  `features/steps/retrieval.steps.ts` 裡新增的步驟(既有步驟未動),沒有動
  `common.steps.ts`、`standalone.json`、`package.json`。
