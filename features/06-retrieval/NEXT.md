# 06 · retrieval — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-03,回填) |
| 進行中 | 無 |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(接進 apps/api composition root)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 契約:`02-authorization` phase-1 至少能產出一個真的 `RetrievalScope`(E04-S009 目前 blocked-team-b;
      在那之前 composition root 只能用 demo 使用者的固定 scope,這要在 ADR 記為 I2 的已知限制)
- [ ] 契約:E06-S043 的「跨部門重匯 = 拒絕」裁定已由使用者在協調者 session 確認

**phase-3(sqlite-vec 成為預設 store)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I2 通過
- [x] 契約:E04-S067(`RetrievalHit.embedding` 由 sqlite-vec 回傳)已 approved

## Gate 未滿足時

**phase-2 卡在 02-authorization**:不要用假的 scope 對應表先接——那正是 E04-S009 裁示禁止的過渡表。
可以先做的:在 `apps/api/src/server.ts` 為 `retrievalPlugin` 寫條件註冊的 plugin.test(走真實
`buildServer()`,比照 `conversationPlugin` 的樣式),scope 由 demo 使用者的 session 固定給 `dept:eng`,
並在場景裡明寫這是 I2 的暫時限制。

**phase-3 等 I2**:sqlite-vec 的 phase-1 場景可以先用 `Scenario Outline` 寫好(紅),不碰實作。

## 完成後

phase-2 完成即解鎖 `07-generation` phase-2(answer() 從 app.retrieval 拿 hits)與 `03-conversation`
的「送訊息 → RAG 回答」phase。那是 I2 的最後一塊。
