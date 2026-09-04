# ADR 0015: composition root 自己持有 retrieval store,I2 用 sandbox seeder 餵它

Status: Accepted · 2026-09-05 ·
**裁決人:協調者。** 依 CLAUDE.md 決策權表「工程取捨 → 技術顧問裁決;**顧問不在時協調者自己定並記 ADR**」
——技術顧問 session ai-km-3a 於本輪已重啟下線(`ListAgents` 查無),故由協調者裁決。
顧問回來後可 supersede;本 ADR 把理由寫全,就是為了讓它一眼看出該不該推翻。

## Context

`05-ingestion/phase-2` 的交付是「一條把 fixture PDF 索引進 dev DB 的指令,讓 I2 有東西可問」。
它的 gate 在 2026-09-04 全部滿足(phase-1 `done`、`06-retrieval/phase-2` `done`),
但**落點不存在**:

- `retrievalPlugin` 沒帶 options 時,預設起一個**全新的空 in-memory store**
  (`services/retrieval/src/service.ts` 的 `createRetrievalService`:`options.store ?? createInMemoryVectorStore()`)。
- `apps/api` 今天就是這樣註冊的(`await app.register(retrievalPlugin);`,不帶任何 options)。
- `apps/api` 的 `BuildServerOptions` **沒有** retrieval store 的覆寫欄位(不像 `dbPath`/`migrationsDir`)。

也就是說:今天不管誰去索引,都索引不到 `apps/api` 實際查詢的那個 store。
`features/05-ingestion/NEXT.md` 自己已經先警告過這個形狀——
「不要為了先做而在 `apps/api` 另外接一個只給 ingestion 用的 store,那會變成
『索引寫到 A、查詢讀 B』的兩份真相,正是 I1 之前那批接線缺陷的形狀」。

`06-retrieval/phase-2.feature` 的檔頭也誠實記過同一件事,並把它留給協調者判斷。這份 ADR 就是那個判斷。

## 考慮過的三條路

| | 做法 | 為什麼不選 |
|---|---|---|
| (b) | 把 `06-retrieval/phase-3`(sqlite-vec 成為預設持久 store)拉到 I2 之前 | E04-S067 雖已 approved,但 phase-3 掛在 **I4**。為了 I2 去動 I4 的東西,等於用「順便一次解決」換掉整合點的順序保證,而整合點順序正是 ADR 0008 買到的東西 |
| (c) | 給 `BuildServerOptions` 加一個 retrieval store 覆寫欄位 | 那是**測試通道被拿來當生產路徑**。`retrievalPlugin` 的 `store` option 檔案裡自己寫明是 "TEST-ONLY seam"(E06-S026),照抄它到生產側會讓那行註解變成謊 |
| **(a)** | **composition root 自己持有 store**,並用既有的 sandbox seeder 樣式餵它 | **選這個**,理由見下 |

## Decision

1. **`apps/api` 的 composition root 自己建 store 與 `RetrievalService`**,再把它交給
   `retrievalPlugin`(`await app.register(retrievalPlugin, { service })`),而不是讓 plugin
   自己在內部生一個沒人拿得到的 store。

   這不是發明新樣式——`createRetrievalService` 的檔頭註解**已經預告了這條路**:

   > Both dependencies are injectable so tests **and, later, a real deployment's
   > composition root** can supply a persistent store or a differently-configured
   > provider without this file knowing about either concern.

   「later, a real deployment's composition root」就是現在。

2. **`enforceEmbeddingVersion` 由 composition root 顯式設為開。**
   E06-S026 在 `plugin.ts` 明文寫了:caller 自己供 `service` 時,
   **plugin 不再、也無法**替它決定這個值,"Do not assume this plugin guarantees the
   protection is on for an injected `service`"。所以這條不是可選的細節——
   照 (a) 走就必須在 composition root 顯式打開它,否則就是把一個 fail-closed 的守門
   在搬家途中弄丟(這正是 §5.1「靜默給出錯誤結果」的定義:embedding 換版後排序全錯,沒有東西報錯)。

3. **`05-ingestion/phase-2` 用既有的 `registerSandboxSeeder` 樣式**把 fixture PDF 索引進
   那個 store,而不是新開第四種機制。`01-identity` 與 `03-conversation` 已經在用它
   (`apps/api/src/server.ts` 的 `ensureSandboxSeederRegistered`),包括那個
   「每個 process 最多跑一次」的 guard。

4. **這個 store 仍然是 in-memory,重開就沒了——這個限制要寫進場景本文,不得默默帶過。**
   05 的 NEXT.md 已經把這條列成 gate 的一部分,本 ADR 只是確認它照原文執行。

5. **持久化留給 `06-retrieval/phase-3`(I4)。** 選 (a) 的附帶好處是那一輪會變得很小:
   composition root 已經持有 store,換成 sqlite-vec 就是換一行建構式,不必再回頭改
   plugin 的介面或 `BuildServerOptions`。

## Consequences

**容易了什麼**:I2 第五塊(05 phase-2)現在有落點,不必等 I4;而且 06 phase-3 從
「要改介面」降級成「換一行」。

**難了什麼,以及怎麼擋**:

| 風險 | 擋法 |
|---|---|
| composition root 忘了開 `enforceEmbeddingVersion`,embedding 換版後靜默排序全錯 | 這是**嚴格級**的失敗模式。`05-ingestion/phase-2` 必須有一個場景,對著「換版後被拒絕」這個**會變的量**斷言,並做反向驗證(把那個旗標關掉 → 必須紅) |
| in-memory 的限制被後人讀成「已經持久了」 | 限制寫進**場景本文**(決策 4),不是只寫在註解或 ADR 裡。場景是規格,註解不是 |
| 「索引寫到 A、查詢讀 B」重新長出來 | 決策 1 讓 store 只有一個持有者(composition root)。任何第二個 store 的出現都要先解釋為什麼 |

**這份 ADR 不授權**:改 `contracts/openapi/*.yaml`;把 `retrievalPlugin` 的 TEST-ONLY
`store` option 拿來當生產路徑(那是被否決的 (c));動 `apps/worker-ingestion`
(0 行,非同步是 05 phase-3 且另有 gate)。

## Related

ADR 0007(plugin 接縫與 `fp()`)、ADR 0008(整合點順序)、ADR 0014(I2 的固定 scope)、
E06-S026(embedding 版本守門)、E04-S067(sqlite-vec store)、`features/05-ingestion/NEXT.md`。
