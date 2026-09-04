# 06 · retrieval — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-03,回填) |
| 進行中 | phase-2(2026-09-04,測試 agent 已交出紅的 `phase-2.feature` + steps,等協調者確認/merge,再進 IMPLEMENT) |
| 下一個 | phase-2 IMPLEMENT |

## 下一個 phase 的 gate

**phase-2(接進 apps/api composition root)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [x] 契約:`02-authorization` 產出真 scope **今天做不到**(E04-S009 已由顧問裁定,但 2a 發現 `01-identity` 沒有 department id 欄位、`RetrievalScope` 沒有 deny 欄位,2a/2b 進行中)。
      **依 `docs/adr/0014-i2-fixed-demo-scope.md`,I2 期間 composition root 用 demo 使用者的固定 `dept:eng`**,`retrieve()` 簽名不變、不建過渡對應表;場景要明寫這是 I2 的暫時限制。此 gate 因此**解除**。
- [x] 契約:E06-S043 的「跨部門重匯 = 拒絕」裁定已由使用者確認(2026-09-03「我都批准了」,見 `docs/DECISIONS_NEEDED.md` 已批示表;此核取方塊 2026-09-04 補勾,先前是舊的)

**phase-3(sqlite-vec 成為預設 store)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I2 通過
- [x] 契約:E04-S067(`RetrievalHit.embedding` 由 sqlite-vec 回傳)已 approved

## Gate 未滿足時

**phase-2 卡在 02-authorization**:不要用假的 scope 對應表先接——那正是 E04-S009 裁示禁止的過渡表。
可以先做的:在 `apps/api/src/server.ts` 為 `retrievalPlugin` 寫條件註冊的 plugin.test(走真實
`buildServer()`,比照 `conversationPlugin` 的樣式),scope 由 demo 使用者的 session 固定給 `dept:eng`,
並在場景裡明寫這是 I2 的暫時限制。

**2026-09-04 更新**:上面這件事的**規格**已經寫好(`phase-2.feature` 4 個場景,全部紅,見
FEATURE.md「phase-2 提案」),等協調者確認/merge 才進 IMPLEMENT。IMPLEMENT 要做的就是：
比照 `conversationPlugin`/`feedbackPlugin` 的條件註冊樣式,把 `retrievalPlugin` 接進
`apps/api/src/server.ts`——這樣就能讓 `phase-2.feature` 的第一條 Then(`app.retrieval` 在父實例
上可見)變綠;每個場景第二條 Then 也會跟著真的被跑到。**待協調的一件事**:IMPLEMENT 之前需要
決定要不要順便替 `apps/api` 加一個測試用的 retrieval store/service 注入通道(比照
`BuildServerOptions.dbPath`/`migrationsDir`)——沒有這個通道,`app.retrieval` 預設是空 store,
「拿到的引用真的指回原文」「跨部門 Deny-Wins」這兩個性質沒有地方能在 06-retrieval 自己的 phase
裡驗證(細節見 FEATURE.md 開放問題/待協調)。

**phase-3 等 I2**:sqlite-vec 的 phase-1 場景可以先用 `Scenario Outline` 寫好(紅),不碰實作。

## 完成後

phase-2 完成即解鎖 `07-generation` phase-2(answer() 從 app.retrieval 拿 hits)與 `03-conversation`
的「送訊息 → RAG 回答」phase。那是 I2 的最後一塊。
