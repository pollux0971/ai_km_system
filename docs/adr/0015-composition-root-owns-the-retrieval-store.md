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

---

## 修正:D3(sandbox seeder)是錯的,由 D3′ 取代(2026-09-05,同日)

**發現者**:`05-ingestion/phase-2` 的開發 agent,在實作途中撞到,停下來回報而不是硬做。
**裁決人**:協調者(同上,顧問不在)。ADR 只增不刪,所以原文的 D3 留著,這一節說明它錯在哪。

### 錯在哪

D3 說「用既有的 `registerSandboxSeeder` 樣式把 fixture PDF 索引進那個 store,
不新開第四種機制」。我選它的理由是**不要發明新樣式**——這個理由本身沒錯,
但我沒有檢查那個樣式的**觸發時機**與這個 phase 要證明的事**相不相容**。

`registerSandboxSeeder` 是**登入時**(綁 `ownerKey`)或**開機時**觸發的自動行為。
而 `05-ingestion/phase-2.feature` 的場景 4 斷言的是:

> 一個 server instance 索引進去的東西,**不會**存活到第二個 server instance
> ——第二個 server 查到的 chunk id 集合是空集合(這是 D4「in-memory 重開就沒了」
> 寫進場景本文的方式)

那個場景的第二個 server **也會登入 `demo-user`**。所以任何登入觸發或開機觸發的自動 seed
**會把第二個 server 的 store 也灌滿**,場景 4 當場變成假的。

**D3 與 D4 在同一份 ADR 裡互相矛盾,而我寫的時候沒看出來。**

### 為什麼會寫錯:我拿樣式的「名字」當結論,沒拿它的「行為」

`registerSandboxSeeder` 這個名字讀起來就是「把示範資料放進去」,而我要的正是
「把示範資料放進去」——名字對上了,我就停止追問。真正該問的是**它什麼時候跑**,
而那個答案(每次登入)才是與規格相關的性質。

這是 GHERKIN_WORKFLOW §5.3「機制要用量的不要用讀的」的一個變形:
我不是從原始碼推斷錯了機制,而是**從名字推斷了機制**,連原始碼都沒讀到那一層。
§5.3 的原文講的是工具與環境;這裡證明它對**既有樣式的複用**同樣成立
——「照既有樣式做」不豁免「先確認那個樣式的行為」。

### D3′(取代 D3)

**`app.ingestion` 是一個 on-demand 的 `IngestionService` 接縫,不掛任何自動 seeder。**

- composition root 把它與 `retrievalPlugin` **共用同一個 store**(D1 不變,那才是重點)。
- roadmap 對這個 phase 的原文是「**一條**把 fixture PDF 索引進 dev DB 的**指令**」
  ——**指令**就是指令:一次明確的呼叫(demo script / 測試步驟 / 未來的 CLI),
  不是開機或登入時偷偷發生的事。
  `05-ingestion` 的測試 agent 交件時就已經指出「指令 vs seeder」有落差並留給協調者判斷;
  它是對的,我當時沒有處理那個落差,直接寫進了 D3。
- 附帶好處:on-demand 讓場景 4 那條「第二個 server 是空的」成為**真的**斷言,
  而不是一個被自動 seed 悄悄破壞掉的斷言。

**D1、D2、D4、D5 不變。** 特別是 D2(`enforceEmbeddingVersion` 顯式打開)與
D4(in-memory 限制寫進場景本文)不受本修正影響。

### 連帶要處理的一件事(不是這一節能解決的)

開發 agent 同時回報:場景 3(D2 的嚴格級目標,「index 時的 embedding 身分與現在不同 → 被拒絕」)
今天**無法變綠**——`ingest()` 沒有任何參數可以指定「用哪個 embedding 版本寫入」,
所以「索引時與查詢時用不同 embedding provider」這個前提做不出來。

這代表 D2 的反向驗證目前是**空的**:把 `enforceEmbeddingVersion` 從 `true` 翻成 `false`,
場景結果**逐位元不變**(開發 agent 實測過)——不是因為守門壞了,是因為**沒有任何場景走到它守的那條路徑**。

依 §5.2「沒有可失敗檢查點的工作項不得標 done」,**這件事必須在 `/phase-done` 之前解決**,
有兩條路,由協調者在收到開發 agent 的完成回報後裁決並記在這一節底下:
(a) 給 `ingest()` 一個明確的 embedding 身分注入點(那是實作變更,要評估是不是超出本 phase);
(b) 承認場景 3 在本 phase 做不到,把它降級為 phase-3 的 gate,並在 `.feature` 動刀
   ——**但 `.feature` 只由使用者或 `/feature` 流程改**(§6),所以走 `/feature`,不是協調者直接改。
