# 04 · model-gateway

## 一句話

產品裡沒有任何一段程式自己去呼叫模型:要向量、要答案、要逐字稿,都只能從這一道門進去,
而且從 process 內部呼叫函式與從外面打 HTTP,走的是同一份實作。

## owner

待指派(phase-1 回填由 04-model-gateway 測試 agent 完成,2026-09-04)。

## 範圍

- **in-process 主路徑**(ADR 0007 §1):`createModelGateway()` 產出 `embed()` / `generate()`,
  由 `modelGatewayPlugin` 以 `app.decorate("modelGateway", …)` 掛上,`fp()` 包裝,對 sibling plugin 可見
- **兩條薄路由**(ADR 0007 §2):`POST /v1/embeddings`、`POST /v1/generate` 解析 request、呼叫
  **同一個**函式、把錯誤映射成契約宣告的狀態碼與 `code`,handler 內沒有自己的行為
- **輸入守門在 gateway 這一層,不在路由**:批次上限 256、單段 8192 字、question 4096 字、
  context 64 段——只在 HTTP 邊界擋等於沒擋
- **fidelity 守門**:provider 宣告的維度與實際回傳的向量長度不符 → `EmbeddingUnavailableError`
  (503),不是 200 帶著錯位向量;數量不符同理
- **不信任 provider**:`assertCitationsGrounded` 在 gateway 這一層檢查引用是否都在 context 內,
  捏造一筆就整個回應被拒,不是濾掉那一筆
- **fail-closed**:空 context → 422 `GENERATION_NO_CONTEXT`(不得用參數知識作答);未登入 → 401,
  在任何模型呼叫之前
- **條件註冊**:契約沒載入就不註冊該路由(404,不是 boot 時 500)——E04-S049/S050 的教訓
- **provider 選型守門**:宣告的 provider 名稱與實際建構出來的實例不符 → 拒絕啟動;
  `fake` 不得在 `NODE_ENV=production` 啟用
- **ASR**:`POST /v1/transcriptions`,WAV 格式/取樣率/長度驗證在送模型之前,
  OpenCC 簡轉繁(`cn→twp`),telemetry 只記 metadata 不記文字

## 不在範圍

- 真模型(PF3):embedding 選型與 generation 模型是 `docs/DECISIONS_NEEDED.md` #2(使用者級),
  ADR 0009 已有建議;phase-1 一條 `@model` 場景都沒有

  > **⚠️ 2026-09-05 更正:「`@model` tag 的場景 CI 跳過、本機不跑」這句話是假的。**
  > 搜過 `package.json`、`features/cucumber.js`、`.github/workflows/ci.yml`——
  > **沒有任何地方寫 `not @model`**。CI 之所以碰不到它,只是因為各 job 的 tag 運算式
  > 恰好不含它,**不是有機制在過濾**。
  >
  > 這個差別在 2026-09-05 變成實際問題:協調者依顧問裁決把一條場景搬進
  > `phase-3.feature`,那是本 repo **第一個** `@model` 場景,於是**裸跑
  > `pnpm accept` 現在會因為它的 undefined 步驟而紅**。
  >
  > 依 GHERKIN_WORKFLOW §7.6,裸跑 accept 對 `todo` 的東西出現 undefined
  > **本來就是「還沒做」不是「弄壞了」**,所以這個紅是預期的、不需要新機制。
  > **要改的是這句宣稱,不是加一個沒有人要求的過濾器**——一句描述機制而該機制
  > 不存在的話,和 `createMessage` 那段 TRANSITIONAL 是同一類(ADR 0017)。
  > 若日後真的要「本機不跑」成為機制,那是獨立決定,不是這裡順手加。
- 誰可以看哪些文件(→ `02-authorization`);檢索與排序(→ `06-retrieval`)
- context 組裝與引用回填(→ `07-generation`);切塊與索引(→ `05-ingestion`)
- 錄音 UI 與麥克風權限(→ `11-app-shell`)
- `tools/asr-readiness` 的環境診斷(見「開放問題」:它需要真的 whisper-server binary 與模型檔,
  這台機器上沒有,所以它不是 phase-1 的自動場景)

## 來源

- 契約:`contracts/openapi/embedding.yaml`、`contracts/openapi/generation.yaml`、
  `contracts/openapi/transcriptions.yaml`
- ADR:[0007](../../docs/adr/0007-model-gateway-in-process-primary-path.md)(in-process 為主路徑、
  `fp()` 包裝)、[0004](../../docs/adr/0004-asr-runtime-whisper-cpp.md)(whisper.cpp)、
  [0009](../../docs/adr/0009-local-embedding-rerank-remote-generation.md)(模型選型,Proposed)
- 舊 story(素材,不是規格):E12-S030/S031、E12-S032/S033、E04-S038/S039、E04-S087/S088、
  E04-S049～S053(接縫漂移的教訓)
- 規格庫:`SOURCE_BASELINE.md` §5 rule 28「Model 呼叫必須經過 Model Gateway」、§10 Principle 2

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@model-gateway and @standalone and not @manual'
```

預期輸出:`13 scenarios (13 passed)`。全部 in-process 或 `app.inject()`,用 PF1 的
deterministic embedder 與 canned answer writer,不需要 DB、不需要模型、不開 port、不連外。

⚠️ 根目錄 `standalone.json` 目前寫的是 `pnpm --filter @ai-km/features accept -- --tags '…'`。
在 pnpm 11.9.0 上那個 `--` **會被原樣傳給 cucumber-js**,cucumber 把它當成一個檔案路徑,
整個指令以 `ENOENT: … open '…/features/@model-gateway and @phase-1 …'` 失敗(exit 1)。
06-retrieval 那一列一樣會失敗——這不是本資料夾造成的。見「待協調」。

## 依賴

**phase-1(回填)**:只依賴 `services/model-gateway/src` 與 `contracts/openapi/{embedding,generation,transcriptions}.yaml`。
沒有 DB、沒有 `apps/api`、沒有其他能力資料夾。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(在真的 `apps/api` 裡被 06/07 呼叫,兩條路由對真 session) | I1 通過(已)、`01-identity` phase-1 | 路由要對真的 `requireSession` 與 session cookie,不是 test harness 的 `x-test-user` |
| phase-3(真模型 PF3:`@model` 場景、`HttpEmbeddingProvider` 對真的 llama-server) | `docs/DECISIONS_NEEDED.md` #2 使用者拍板 + ADR 0009 由 Proposed 轉 Accepted | 模型選型是使用者級決策;PF3 之前任何關於語意召回/答案品質的斷言都不成立 |
| phase-4(ASR 端到端:真 whisper-server + 真模型檔 + 真錄音) | 目標機器上完成 `models/asr/README.md` 的建置與下載 | `tools/asr-readiness check-asr` 在本機實測 exit 1(binary 與模型檔都沒有),見「開放問題」 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/model-gateway/src` |
| HTTP | Fastify 5 plugin(`fp()` 包裝) | ADR 0007 §5 |
| 契約驗證 | ajv 2020 + `@apidevtools/json-schema-ref-parser` 讀真的 yaml | `src/testing/contract-check.ts` |
| 測試 | vitest 11 檔 138 條 + cucumber `phase-1.feature` 13 場景 | |
| 級別 | **標準級**,但 **fidelity 守門那一條是嚴格級** | 見下 |

**分級的理由**:本資料夾不做授權判斷、不決定誰看得到什麼(那是 02/06),多數失敗模式是
會當場報錯的 400/413/422/503,屬標準級。**唯一的例外是維度/數量守門**:embedding 換版或
provider 回傳錯長度的向量時,沒有任何東西會拋錯,相似度照算,使用者只會看到「排序怪怪的」
——這正是 GHERKIN_WORKFLOW §5.1 定義的「靜默給出錯誤結果」,所以
「A model whose vectors are the wrong length is refused instead of ranking silently wrongly」
與反向驗證所打的 L2 正規化,按嚴格級對待。

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own | `plugin.test.ts`: AC-P1 ★ app.modelGateway 對 SIBLING 可見;AC-P2 in-process 呼叫可直接用 |
| A batch comes back in the order it was sent… | `gateway.test.ts`: AC-G1 回傳與輸入等量、依輸入順序、帶 index |
| A batch larger than the contract allows is refused… | `gateway.test.ts`: AC-G3 超過 256 段是 413,不是靜默截斷 |
| A model whose vectors are the wrong length is refused… | `gateway.test.ts`: AC-G4b provider 宣告的 dimensions 與實際向量長度不符時拒絕 |
| The answer cites exactly the passages it was handed | `gateway.test.ts`: AC-G6 引用必為 context 子集;`canned.provider.ts` 的 citations = map over context |
| An answer citing a passage nobody supplied is thrown away whole | `gateway.test.ts`: AC-G9 ★ provider 捏造引用時整個回應被拒 |
| With nothing retrieved the gateway declines to answer… | `gateway.test.ts`: AC-G7 空 context 是 422,不得用參數知識作答 |
| The embeddings route hands back exactly what an in-process caller gets | `model-gateway-routes.test.ts`: AC-R1 ★ route 回傳與 in-process 呼叫完全相同 |
| An empty request is refused at the route with the code the contract declares | `model-gateway-routes.test.ts`: AC-R3 (L2) 空輸入 → 400 VALIDATION_ERROR,且符合契約 |
| Someone who is not signed in never reaches the model | `model-gateway-routes.test.ts`: AC-R6 未登入 → 401,授權在任何模型呼叫之前 |
| Without its contract loaded the gateway mounts no embeddings route at all | `plugin.test.ts`: AC-P3 契約未載入時,路由不註冊——404,不是 boot 時 500 |
| A spoken Mandarin clip comes back as Traditional Chinese | `routes/transcriptions.test.ts`: AC1 valid 16k mono PCM16 WAV + fake provider → 200 with normalized text |
| A clip recorded at the wrong sample rate is refused with the reason… | `routes/transcriptions.test.ts`: AC2 44.1kHz → 400 details.reason=UNSUPPORTED_SAMPLE_RATE |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@model-gateway and @phase-1'` → `13 scenarios (13 passed)`。
- 反向驗證(2026-09-04,回填時做,手動——`tools/mutate.mjs` 只驅動 vitest):
  `services/model-gateway/src/embedding/deterministic.provider.ts` 的 `normalise()` 把
  `magnitude = Math.sqrt(magnitude);` 改成 `magnitude = 1;`(L2 正規化失效,向量長度不再是 1)。
  「The capability runs on its own」變紅,訊息原文:
  `向量的 L2 長度應為 1(±1e-6),實際 1.7320508075688772——未 L2 正規化的向量會讓點積不等於
  cosine,檢索排序看起來合理但是錯的(embedding.yaml「Normalisation is contractual」)。`
  ——它說的是**這項工作的決定性性質**(向量的長度這個數字),不是副作用。還原後 sha256 逐位元
  相同、13/13 回綠。四段輸出在該次 commit 的 body。
- `@manual`:無。
- **未涵蓋、且不得被上面任何一條冒充的**:真模型(PF3)與真 ASR 端到端。見「開放問題」。

## 待協調(要協調者改共用檔,worker 不動)

1. **`features/steps/common.steps.ts` 的
   `the {string} plugin is registered on a bare server and the server becomes ready` 目前無法使用。**
   句子有一個 `{string}` 參數,但 handler 宣告成 `async function (this: KmWorld)`(0 個參數),
   cucumber 直接判定 `function has 0 arguments, should have 1 (if synchronous or returning a promise)
   or 2 (if accepting a callback)` 並讓該步驟紅。**11 個資料夾只要照 brief 用這句就都會紅。**
   建議措辭:把 handler 改成 `async function (this: KmWorld, _name: string)`(參數不使用,只為滿足
   cucumber 的 arity 檢查;命名加底線以免 eslint 的 no-unused-vars)。
   **本資料夾的暫時作法**:在 `features/steps/model-gateway.steps.ts` 定義了自己的
   `the model gateway plugin is registered on a bare server and the server becomes ready`,
   內容與通用步驟逐字相同(讀 `pluginUnderTest` → `register()` → `ready()` → 寫 `registeredApp`)。
   共用檔修好後,把 `phase-1.feature` 那兩處換回通用句子、刪掉那個定義即可,其他步驟不用動。

2. **`standalone.json` 的 12 條指令在 pnpm 11.9.0 上全部跑不起來。**
   `pnpm --filter @ai-km/features accept -- --tags '…'` 的 `--` 會被原樣轉給 cucumber-js,
   它把 `--` 之後的整串當檔案路徑,失敗訊息是
   `[Error: ENOENT: no such file or directory, open '…/features/@retrieval and @standalone and not @manual']`,
   exit 1。**實測**:`06-retrieval` 那一條也一樣失敗;拿掉 `--` 之後同一條指令回
   `9 scenarios (9 passed)`。建議措辭:把 12 條 `accept -- --tags` 一律改成 `accept --tags`
   (`features/README.md` 與 `features/_template/FEATURE.md` 的示範指令同步改)。
   影響面:`/phase-done` 的「單獨執行 exit 0」這一項對**每一個**資料夾都會假紅。

3. (可選)`this.bag["registeredApp"]` 留下的 Fastify 實例目前沒有人 close(`_world.ts` 的 After
   只關 `this.app`)。沒有 listen 就沒有 handle,不會卡住 runner——**這是實測**:13 個場景跑完
   0.4 秒內正常退出。列在這裡是因為 06-retrieval 的 `retrievalApp` 也一樣,將來 12 個資料夾都這樣
   時值得由協調者在 `_world.ts` 的 `cleanup()` 統一收掉。

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)in-process embed/generate、兩條薄路由與契約驗證、fidelity 守門、條件註冊、ASR | I1 | done | 2026-09-04 |
| 2 | **兩條 HTTP 路由本身對真 session 可用;06/07 依 ADR 0007 §1 走 in-process,不經路由** | **I2(驗收補寫,不在 I2 五塊內)** | todo | |

**phase-2 狀態細節(2026-09-05,顧問裁決 `DECISIONS_NEEDED` #37)**:
協調者發現這一列與 `docs/01-roadmap.md` 的 I2 清單不一致(那份只列 06/07/03/11/05),
初查後認為內容**看起來已經滿足**(`modelGatewayPlugin` 已註冊在真 `apps/api`、
兩條路由已用 `requireSession`、而 I2 的 `@e2e` 路徑不經過那兩條路由)。

**顧問的裁決不是「那就改成 done」**:

> **phase 表上的 phase 沒有 `.feature` 就不能是 `done`,也不能因為「看起來已滿足」直接改狀態。**

——這一句是重點。`04-model-gateway/` 底下**沒有 `phase-2.feature`**,所以就算內容都對,
**也沒有任何東西會在它壞掉時變紅**;`done` 與 `todo` 的差別會只是有人改了一個字。

**2026-09-05 描述更正(顧問裁決 #38)**:這一列原本寫「在真的 `apps/api` 裡**被 06/07 呼叫**」。
顧問裁定:**「06/07 該走路由」從來不是意圖**——是那一列寫的人**把 ADR 0007 §1 的備援路徑
當成主路徑**。06/07 走的是 in-process,而它們 phase-2 的 evidence 驗的就是 in-process 實例,
**那是對的實例,不用回頭重查**。描述已改成第一種措辭。

**做法**:測試 agent 補 `phase-2.feature` **三條**——(1) `modelGatewayPlugin` 在真
`buildServer()` 上註冊;(2) 兩條路由**無 session → 401**;(3) 有 session → 200 且**回應 shape 對契約**。
**預期一寫就綠**——那是**回填形狀**,與 phase-1 一樣合法。然後走 `/phase-done` 標 `done`。
`docs/01-roadmap.md` **不動**(它的 I2 五塊清單是對的)。**標準級。**
| 3 | 真模型(PF3):`@model` 場景、`HttpEmbeddingProvider` 對真 llama-server | — | todo | |

**phase-3 的 DoD 追加一條(2026-09-05,顧問裁決 #38 的第二層)**:
**composition root 建「一個」embedding provider,同一個實例注入 ingestion 與 retrieval。**

背景:`04` 的驗收 session 挖出全 repo 有**四個獨立的 `createModelGateway()` 呼叫點**,
**index-time 與 query-time 的 embedding 身分今天只是「預設剛好相同」**,靠
`enforceEmbeddingVersion` **事後**擋。那是守門在擋,不是架構保證。

改的東西很小:`services/retrieval/src/service.ts:204` 已經收 `embedding` 參數、
`apps/api/src/server.ts:429` 已經有注入點——**只是把兩處接到同一個物件**。
版本守門**留著當第二道**。

**為什麼落在 phase-3 而不是現在**:真模型落地那天,兩邊必須是**同一個 `bge-m3` 實例**
——**那才是這條真正要緊的時點**。今天兩邊都是 deterministic 預設,改了看不出差別。

**標準級。反向驗證**:注入兩個不同 provider → `05-ingestion/phase-2b` 的場景 3 必須紅
並印出兩個版本字串。**那條場景已經存在**,要證明的是它**對「同一實例」這個改法仍然會響**。

這是 **ADR 0015 的延伸**(composition root 擁有 store,**也擁有 embedding 身分**),
見該 ADR 的 2026-09-05 追加段。
| 4 | ASR 端到端:真 whisper-server + 真模型檔 + 真錄音 | — | todo | |

## 開放問題

- **`tools/asr-readiness` 沒有進 phase-1,理由是實測的**:在這台機器上
  `pnpm --filter @ai-km/tool-asr-readiness check-asr` **跑得起來**(不需要 GPU 才能執行),
  輸出 `❌ ASR 環境尚未就緒`、`GPU:NVIDIA GeForce GTX 1650(4096 MiB VRAM)`、
  `whisper-server:未找到`、`模型檔:未找到`,**exit 1**。也就是說它的退出碼是**環境的函數**
  ——在裝好 binary 與模型的機器上會是 0。把它寫成場景等於把「這台機器有沒有裝東西」
  當成規格,所以它屬 phase-4(真 ASR 端到端),不屬 phase-1。
  `verify-asr` 更走不動:它需要 `fixtures/sample-zh-en.wav`(真錄音,未進版控)與一個正在跑的
  sidecar。
- **`POST /v1/generate` 的路由層場景只回填了 in-process 側與 embeddings 路由側。**
  `model-gateway-routes.test.ts` 的 AC-R8～R12(generate 路由的 200/422/503/401)是既有的 vitest,
  但再多寫 5 個 cucumber 場景會把這個 phase 推到 18 條、變成模板。取捨是:generate 與 embeddings
  走的是同一個 `buildGatewayTestApp` 與同一套錯誤映射,薄包裝的性質由 embeddings 側的
  「route 回傳 == in-process 回傳」證明,generate 的行為由 in-process 的四個場景證明。
  若審核者認為要補,是 phase-2 的一個場景,不是缺陷。
- `HttpEmbeddingProvider`(bge-m3 / llama-server,E04-S087/S088)有 19 條 vitest,但它要對的是
  一個真的 sidecar;PF2 的「對契約驗證過的假 server」場景要等 phase-3。
- `assertCitationsGrounded` 在 gateway 與(舊)pipeline 兩處都被呼叫過。`services/rag-skeleton`
  已退場,現在只剩 gateway 這一份。這裡記一筆,避免將來有人「為了保險」再複製一份出去。
