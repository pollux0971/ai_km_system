# steps/ — 步驟定義

Cucumber 的步驟定義。**先讀 `_world.ts` 再寫新的**——它定義了所有步驟共用的狀態容器。

## 檔案分工

一個能力一個檔:`retrieval.steps.ts`、`ingestion.steps.ts`……整合用的放 `integration.steps.ts`。
同一句步驟在不同 feature 出現時**共用同一個定義**(cucumber 對重複定義報錯,這是好事,
它逼你統一措辭)。

## 寫步驟的原則

- **Given 設定狀態,When 做一件事,Then 只斷言**。Then 裡面不要有副作用。
- **步驟措辭跟著 feature 檔走**,不要為了方便改 feature 的英文。
- **參數用 cucumber expression**:`the person asks {string}`,不要用正規表示式除非必要。
- **不在步驟裡寫商業邏輯**。步驟只是薄薄一層轉接,邏輯在 `services/*`、`packages/*`。
- **綁到既有測試同樣的入口**:phase-1 回填的步驟呼叫的函式,必須是該 service 的
  vitest 測試也在呼叫的那個(`createRetrievalService`、`createIngestionService`、
  `buildServer()`…)。不繞、不 mock 掉接縫。
- **Then 的斷言對著「壞掉時會變的量」**:分數、順序、內容、身分。「有結果」「沒拋錯」不算。

## 通用步驟:`common.steps.ts`(只有協調者改)

| 句子 | 你的 When 要做什麼 |
|---|---|
| `a fresh server with fake providers` | 不用做,通用步驟會 `startServer()` |
| `a temporary working directory` | 讀 `this.dir` |
| `the standalone command for this capability is run` | 不用做;由 feature 首行 tag 推 `standalone.json` 的 key |
| `it exits with status {int}` / `the output contains {string}` | 讀 `this.lastRun` |
| `the response status is {int}` / `the response error code is {string}` | 你的 When 把 `app.inject()` 結果放進 `this.lastResponse` |
| `it is rejected with {string}` | 你的 When 用 try/catch 把錯誤放進 `this.lastError` |
| `the generation provider is never called` | 你的 fake provider 把呼叫推進 `this.providerCalls` |

規則:
- **只用在 `@manual` 場景的句子不要定義**(自動測試會跳過它們,定義了只會跟別人撞)。
- 你需要新的通用句子:寫在自己 FEATURE.md 的「待協調」段,合併時協調者加進 `common.steps.ts`。
- feature 檔第一行的能力 tag(`@retrieval` 之類)會被 `standaloneKey()` 用來找 `standalone.json`
  的 key,不要改。

## 角色守門(ADR 0008 §4)

開發 agent 的 branch **不得**出現對 `features/steps/**` 或 `*.test.ts` 的變更:

```bash
git diff --name-only main...<branch> | grep -E '\.test\.ts$|^features/steps/' && echo "RETURN TO SENDER"
```

步驟與單元測試由測試 agent 依 `.feature` 先寫(紅),開發 agent 只寫實作到綠。

## TypeScript 載入

`pnpm --filter @ai-km/features accept` 用 `NODE_OPTIONS=--import=tsx cucumber-js`。
步驟檔之間的 import 寫 `./_world.js`(ESM 慣例,tsx 會對應到 `.ts`)。
跨 package 的 import 走相對路徑到 `services/<x>/src/*.js`,與各 service 測試相同。
