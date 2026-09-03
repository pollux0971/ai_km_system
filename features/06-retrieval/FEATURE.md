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
| 2 | 接進 apps/api composition root,供 07 與 03 呼叫 | I2 | todo | |
| 3 | sqlite-vec 成為預設持久 store | I4 | todo | |

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
