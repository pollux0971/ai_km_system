# ADR 0007: Model Gateway 以 in-process 呼叫為主路徑，HTTP 路由是同一函式的薄包裝；會 decorate 的 plugin 一律 `fp()` 包裝

Status: Proposed（使用者 2026-09-02 拍板：baseline §5 rule 28「Model 呼叫必須
經過 Model Gateway」的落地形狀。本 ADR 固定 `services/retrieval`、
`services/generation`、`services/ingestion` 未來呼叫 embedding／generation 的
方式，供 E04／E06／E12 的 story 平行開發時共用，不得各自另起爐灶。）

## Context

`AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md` §5 第 28 條要求「Model 呼叫
必須經過 Model Gateway」，§10 Principle 2 把 Model Gateway 畫成 RAG 管線裡的
一段。**兩處都沒有說它是一個網路跳點。**

同時 ADR 0003 §1 已經定下：`apps/api` 是**單一 process**，domain 程式碼放在
`services/<domain>` 並各自匯出一個 Fastify plugin，由 `apps/api` 註冊。
`services/model-gateway` 就是這樣掛進去的（`apps/api/src/server.ts`）。

於是「經過 gateway」有三種可能的形狀，而它們的差別不是風格問題：

1. **走 HTTP**：`services/retrieval` 打 `POST /v1/embeddings`。但呼叫端與被呼叫
   端在同一個 process，這是**對自己的 loopback HTTP** —— 多一次序列化、多一組
   逾時與連線失敗模式、多一個要維運的自我依賴。
2. **只做 in-process**：契約退化成型別介面，`servers: /v1` 與 sessionCookie
   失去意義，process 外的消費者無路可走。
3. **兩者都有**：契約對外是 REST，對內是函式。

`2026-09-02` 的調查另外確認：`services/model-gateway` 現有唯一實作切片是
`POST /v1/transcriptions`（E12-S031），embedding／generation **完全沒有**，
1,805 行裡可重用的非 ASR 機制只有約 199 行。所以這個決定是在還沒有既成事實
的時候做的，代價最低。

## Decision

### 1. In-process 是主路徑

`services/model-gateway` 匯出 `createModelGateway()`，產生具備 `embed()` 與
`generate()` 的 `ModelGateway`。plugin 以 `app.decorate("modelGateway", …)`
把它掛上，process 內的呼叫端（`services/retrieval`、`services/generation`、
`services/ingestion`）**直接呼叫這些函式**。

這滿足 rule 28：呼叫確實經過 gateway。它不經過的是 socket，而 baseline 從未
要求 socket。

### 2. HTTP 路由是同一函式的薄包裝，不是第二套實作

`POST /v1/embeddings`（`contracts/openapi/embedding.yaml`）與 `POST /v1/generate`
（`contracts/openapi/generation.yaml`）解析 request、呼叫**同一個** `ModelGateway`
函式、把拋出的錯誤映射成契約宣告的狀態碼與穩定 `code`。**handler 內不得有任何
它自己的行為。**

兩份契約的 `description` 已寫明這件事，避免日後被誤讀成疏漏。

一條規則不在 `gateway.ts` 卻出現在 route 裡，就代表 in-process 路徑已經悄悄
失去它 —— 那正是 E04-S049→S053 那串接縫缺陷的形狀。因此必須有測試**量出**
兩條路徑相等，而不是在註解裡宣稱：
`services/model-gateway/src/routes/model-gateway-routes.test.ts` 的 `AC-R1`／
`AC-R8` 斷言 route 回傳的 JSON 與同一個 gateway 的 in-process 回傳逐欄相等。

### 3. 驗證邏輯放在 gateway 函式，不放在 route

輸入上限（`input` 最多 256 段、每段最長 8192 字、`question` 最長 4096、
`context` 最多 64 段）、空輸入、空 context、provider 回傳數量錯位、以及
「引用必須是 context 子集」的檢查，**全部在 `gateway.ts`**。

理由：in-process 呼叫端必須拿到與 HTTP 呼叫端**完全相同**的保證。**只在 HTTP
邊界擋的上限，對主路徑而言等於沒擋。** route 只負責把 gateway 拋出的具名錯誤
翻譯成狀態碼。

### 4. 任何會 `app.decorate()` 的 Fastify plugin，必須用 `fastify-plugin` 的 `fp()` 包裝

Fastify 預設會給每個 plugin 一個新的封裝 context。未包 `fp()` 的 plugin 裡
`app.decorate(...)` 只會落在**子實例**上，對所有 sibling plugin 不可見。

**而路由照常註冊、照常正確回應。** 失敗是靜默的。

### 5. 這類 plugin 必須有至少一條走真實 `buildServer()` 完整註冊路徑的測試

**不得只用 handler-shortcut 測試工具**（`build-test-app.ts` /
`build-gateway-test-app.ts` 這種直接掛 handler 的 harness）驗證。那類 harness
完全不經過 plugin 註冊，因此在結構上不可能看見封裝問題。

測試至少要：把真正的 plugin `register()` 進一個 Fastify 實例，`ready()`，
然後從**父實例**斷言 decoration 可見。
範例：`services/model-gateway/src/plugin.test.ts` 的 `AC-P1`。

#### 這條規則的由來

2026-09-02 實作本 ADR 的第 1、2 點時，`modelGatewayPlugin` 沒有包 `fp()`。
用真實 `buildServer()` 探測的結果：

```
--- model-gateway routes present? ---
    ├── /v1/embeddings (POST)
    ├── /v1/generate (POST)
--- app.modelGateway decorated? --- undefined
TypeError: Cannot read properties of undefined (reading 'embed')
```

也就是：HTTP 路由完全正常，而**本 ADR 指定為主路徑的 in-process 接縫根本
不存在**。

當時該 package 有 **87 個測試，全部綠**。它們抓不到，是因為 route 測試直接
掛 handler，從不經過 plugin 封裝 —— 缺陷不在測試「不夠多」，而在測試**沒有
走過那條路徑**。

`identityPlugin`（`services/identity/src/plugin.ts:396`）與 `conversationPlugin`
（`services/conversation/src/plugin.ts:51`）早就用了 `fp()`，兩者的註解都寫明
了理由。既有正確做法沒有被寫成規則，於是第三個 plugin 重犯。本節就是把它
寫成規則。

## Consequences

**變容易的**

- `services/retrieval` / `services/generation` / `services/ingestion` 呼叫模型
  不需要 HTTP client、不需要處理 loopback 的連線與逾時失敗模式。
- 行為只有一份。契約漂移由 `contracts/openapi/__checks__/{embedding,generation}-compat.ts`
  （policy L0）與 route 的契約測試（policy L2）兩層擋住。
- `POST /v1/embeddings` / `POST /v1/generate` 仍然存在，process 外的消費者
  （未來的 worker、其他部署單元）不會被鎖死。

**變難的／要付的代價**

- 每個新增 route 都要證明自己是薄包裝（AC-R1 那種相等性斷言），這是額外的
  測試義務。
- `app.modelGateway` 是一個 process 內的全域接點。哪天 `apps/api` 要拆成多
  process，這個決定必須重新檢視 —— 屆時薄包裝路由已經在，遷移成本是把
  in-process 呼叫換成 HTTP client，不是重寫 gateway。
- 第 4、5 點對**所有**會 decorate 的 domain plugin 生效，不只 model-gateway。
  既有的 identity／conversation 已符合；日後新增的 `services/retrieval`、
  `services/generation` 必須照辦。

**影響對象**

Team B（domain ownership：`services/model-gateway`、`services/retrieval`、
`services/generation`、`services/ingestion`、`apps/api`）為主；Team A 在
`services/retrieval`／`services/generation` 的建置工作上直接受本 ADR 約束。
依 `docs/adr/README.md`，本 ADR 屬跨 Domain 決策，標記 Accepted 前需 Team A
與 Team B 雙方 review。

**尚未涵蓋的**

- 真實 provider（`HttpEmbeddingProvider` / `HttpGenerationProvider`）不在本
  ADR 範圍。上游模型執行環境的 API 形狀由 **E04-S037**（`todo`，Team B：硬體
  規格與地端模型準備）決定；在那之前 gateway 只有 placeholder fake，且在
  `NODE_ENV=production` 下拒絕啟動（`assertProviderUsable`）。
- 逾時與取消的分層（embedding／generation 契約目前沒有 504）屬 **E04-S028**。
