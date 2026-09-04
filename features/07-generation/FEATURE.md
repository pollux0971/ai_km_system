# 07 · generation

## 一句話

一個人問問題時,系統只根據他已經被授權看到的那幾段文字作答,答案裡的每一條引用都指得回
原文,捏造的來源會整段被拒絕而不是被悄悄濾掉。

## owner

待指派(phase-1 回填由 07-generation 測試 agent 於 2026-09-04 完成)。

## 範圍

- context 組裝:把 `services/retrieval` 已授權的 `RetrievalHit` 逐欄投影成 model-gateway 的
  `ContextChunk`(E04-S063 設計約束:不 spread、不 `JSON.stringify`,因為兩者都會把 `scopeKey`
  帶進模型 prompt 而 TypeScript 不會攔)
- 一律走 `createModelGateway().generate()`,不直接呼叫 provider——繞過 gateway 就同時繞過了
  引用接地檢查(baseline §5 rule 28、ADR 0007 §1)
- 引用回填:`documentId` 與 offsets 原樣回填,offsets 指的是原始文件全文
- 捏造引用拒絕:`assertCitationsGrounded` 對整個回應 fail closed,不是把壞的那一條濾掉
- 空 context 短路:沒有可引用的來源時直接回優雅空答案,**完全不呼叫生成模型**
- 空問題拒絕:空字串不得被靜默當成任何一種答案
- `generationPlugin`:用 `fp()` 包裝,把 in-process 接縫 decorate 成 `app.generation`(ADR 0007 §4/§5)

## 不在範圍

- 檢索、排序、scope 前置過濾(→ `06-retrieval`);本能力不重算可見性,授權在到達這裡時已經花掉
  (鐵律 #2,`service.ts` 檔頭第 3 點)
- `answer()` 從 `app.retrieval` 拿 hits、接進 `apps/api` composition root(→ 本資料夾 phase-2,I2)
- 真模型生成(PF3,→ `04-model-gateway`,等 E04-S037)
- 「沒有來源」時要不要回一個結構化的 abstention reason code(E04-S022,產品未定,見「開放問題」)

## 來源

- 契約:[`contracts/openapi/generation.yaml`](../../contracts/openapi/generation.yaml)
  (HTTP 邊界屬 `04-model-gateway`;本能力是同一組行為的 in-process 接縫,ADR 0007)
- 舊 story(素材,不是規格):E04-S059、E04-S063、E04-S064、E12-S033
- 規格庫:baseline §5 rule 28(模型呼叫一律經 gateway)、§10 Principle 3

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@generation and @standalone and not @manual'
```

預期輸出:`6 scenarios (6 passed)`。全部 in-process、canned PF1 生成 provider,不需要 DB、
不需要模型、不開 port。

**權威來源是根目錄的 [`standalone.json`](../../standalone.json) 的 `07-generation`**,這裡只是說明。
`standalone.json` 那行原本多一個 `--`,在 pnpm 11.9.0 下會把 tag 運算式當成路徑而失敗;
**已由協調者修好(`a0e8d80`)**,現在的指令與上面這段一致,直接跑就是 `6 scenarios (6 passed)`。

## 依賴

**phase-1(回填)**:只依賴 `services/generation/src`、`services/model-gateway/src`(canned generation
provider)、以及 `services/retrieval` 的 `RetrievalHit` **型別**(只有型別,沒有執行期呼叫)。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(`answer()` 從 `app.retrieval` 拿 hits,接進 apps/api) | `06-retrieval` phase-2 done、I1 通過(已) | I2 需要 composition root 同時註冊 retrieval 與 generation |
| phase-3(abstention:沒有來源時的結構化理由) | E04-S022 的閾值與行為由使用者拍板 | 目前空 context 回的是自由文字,UI 分不出它與真答案 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/generation/src` |
| 測試 | vitest 3 檔(12 條)+ cucumber `phase-1.feature` 6 場景 + 手動反向驗證 | `.feature` 層級的反向驗證目前是手動的(GHERKIN_WORKFLOW §5.2) |
| 級別 | **嚴格** | 捏造引用與 scopeKey 外洩都是「靜默給出錯誤結果」:壞掉時沒有東西報錯,答案看起來完全正常 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)context 組裝、引用回填、捏造引用拒絕、空 context 短路、空問題拒絕 | I1 | done | 2026-09-04 |

**phase-1 驗收細節(2026-09-04,獨立 session)+ 一個要補的缺口**:四項核心全過
(6 場景、單獨執行 exit 0、typecheck 45/45、lint 37/37、`vitest run` 直接跑不經 turbo
12/12——刻意避開 §5.3 的熱快取假陰性)。兩組反向驗證都由驗收者親自重跑:

1. **捏造引用守門**(`assertCitationsGrounded` 的 `fabricated.length > 0` → `< 0`):
   `.feature` 層紅在 `common.steps.ts` 的訊息,原文含完整 `doc-does-not-exist#0` 與全部
   citations——決定性、不截斷。sha256 還原一致(`e888d8…c310d`),回綠 6/6。
2. **scopeKey 外洩守門**(`buildContext()` 的逐欄投影 → `hits.map(hit => ({...hit}))`):
   紅在 `context chunk doc-maintenance-001#0 帶著部門標籤到達回答模型:{...,"scopeKey":"dept:maintenance"}`
   ——含實際洩漏值。sha256 還原一致(`1c25d1…33ea`)。

⚠️ **驗收者主動抓到、不擋本 phase 但要補的**:同一個突變在 **vitest 層**打 `service.test.ts`
AC2 時,第一條失敗訊息是
`Error: promise resolved "{ answer: '...', …(1) }" instead of rejecting`
——**這正是 §5.2 與 PITFALLS 點名的存在性斷言**:只證明「有沒有拋錯」,捏造的
`doc-does-not-exist#0` 被 vitest json reporter 截斷在 `…(1)` 裡看不到。根因是 AC2 只寫
`.rejects.toBeInstanceOf(FabricatedCitationError)`,沒有內容檢查。

驗收單位是 Gherkin 場景,而場景那層是決定性的,所以 phase-1 判 PASS;但這條 vitest 斷言
本身不合格,**要在 phase-2 順手補一條對著捏造 chunkId 逐字比對的斷言**(§4:做 phase 時
發現缺陷 → 在同一個 `.feature`／測試補,不開編號)。

| 2 | `answer()` 從 `app.retrieval` 拿 hits,接進 apps/api composition root | I2 | todo | |
| 3 | abstention:沒有來源時回結構化理由而非自由文字 | 待定 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own | `plugin.test.ts`: AC-GS1 ★ app.generation 對 SIBLING 可見;AC-GS3 同一個 chunk、相同 offsets 回填到 citation |
| An answer cites the supplied passages and its offsets still address the original document | `service.test.ts`: AC1 citations 是 context 的子集、offsets/documentId 原樣回填;AC5 citation 的 offsets 仍指向原始文件文字 |
| One fabricated source rejects the whole answer instead of being quietly dropped | `service.test.ts`: AC2 provider 捏造引用時整個回應被拒絕 |
| The department label never travels with the context to the answering model | `service.test.ts`: AC3 scopeKey 永不抵達 gateway 或 provider |
| With nothing to cite the answering model is not called at all | `service.test.ts`: AC4 空 context 是真正的短路;`plugin.test.ts`: AC-GS2 |
| An empty question is refused before any model is asked anything | `service.test.ts`: 「空字串問題被拒絕,不會靜默當成任何一種答案」 |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@generation and @phase-1'` → `6 scenarios (6 passed)`。
- 反向驗證(2026-09-04,手動,兩組,證據原文在 commit body):
  1. `services/model-gateway/src/generation/provider.ts` 的 `assertCitationsGrounded` 把
     `if (fabricated.length > 0)` 改成 `if (fabricated.length < 0)`(即「永不拒絕」)→
     「One fabricated source…」場景紅在第一條斷言 `it is rejected with "FabricatedCitationError"`。
     **這段訊息已於 `66f8de1` 更新**:原本記的是「預期會被拒絕,但沒有任何錯誤被拋出」——那是純
     存在性斷言(只證明「有沒有拋錯」),正是審核者的退回理由。協調者修好 `common.steps.ts` 後,
     現在同一個突變的紅訊息是:
     `AssertionError [ERR_ASSERTION]: 預期會被拒絕,但沒有任何錯誤被拋出;實際交回了:{"answer":"看起來正常的回答,其實引用被捏造","citations":[{"chunkId":"doc-maintenance-001#0",...},{"chunkId":"doc-does-not-exist#0","documentId":"doc-does-not-exist","startOffset":0,"endOffset":1}]}`
     決定性的 `doc-does-not-exist#0` 現在**進了訊息本身**,不再是純粹的「有沒有拋錯」。
  2. `services/generation/src/service.ts` 的 `buildContext()` 改成 `hits.map((hit) => ({ ...hit }))`
     (檔頭第 2 點明文警告、TypeScript 不會攔的那個寫法)→「The department label never travels…」
     場景紅在第一條斷言,訊息逐字指出洩漏的值:
     `context chunk doc-maintenance-001#0 帶著部門標籤到達回答模型:{...,"scopeKey":"dept:maintenance"}`。
  兩次都以 `sha256sum` 逐位元證明還原,還原後 6/6 回綠。
- `@manual`:無。

## 待協調(要協調者改共用檔的)——**三條全部過期,保留為歷史紀錄**

1. ~~**`features/steps/common.steps.ts` 的 register 步驟 arity 壞掉**——
   `When("the {string} plugin is registered on a bare server and the server becomes ready", …, async function (this: KmWorld) {…})`
   的 cucumber expression 有一個 `{string}`,但 handler 宣告 0 個參數,cucumber 直接判失敗:
   `function has 0 arguments, should have 1 (if synchronous or returning a promise) or 2 (if accepting a callback)`
   (2026-09-04 在本 worktree 實測,不是從原始碼推的)。
   建議措辭:把 handler 簽名改成 `async function (this: KmWorld, _name: string)`(參數不使用,
   名字只是給場景讀的),或把 pattern 的 `{string}` 拿掉。
   本工單的因應:比照 `06-retrieval` 自己定義 `When the generation plugin is registered on a fresh server
   and the server becomes ready`,仍走真實 `register()→ready()` 並把父實例放進 `this.bag["registeredApp"]`,
   所以通用的 `Then the "generation" plugin is visible on the parent server instance` 照常適用。
   共用步驟修好之後,這一句可以換回通用版。~~ **已修好(`f903291`)**:`common.steps.ts` 的通用步驟
   已補上參數。

2. ~~**`standalone.json` 的指令多了一個 `--`**——`pnpm --filter @ai-km/features accept -- --tags '…'`
   在 pnpm 11.9.0 下會把 `--` 原樣轉給 cucumber-js,cucumber 因此停止解析選項、把 tag 運算式當成
   檔案路徑,ENOENT 退出 1(實測:`06-retrieval` 那一行同樣失敗,拿掉 `--` 後 `9 scenarios (9 passed)`)。
   這影響 `07-generation` 在內的**所有** 10 個非互動項目,`/phase-done` 的「單獨執行 exit 0」會全部假紅。
   建議措辭:把每一項的 `cmd` 從 `accept -- --tags` 改成 `accept --tags`。
   本工單不動 `standalone.json`(共用檔),FEATURE.md 的「單獨執行」段寫的是可用的形式。~~
   **已修好(`a0e8d80`)**:`standalone.json` 的 `--` 已拿掉。

3. ~~`07-generation` 的 `standalone.json` `expect` 目前是寬鬆的 `"scenarios ("`;比照 `06-retrieval`
   可以收緊成 `"6 scenarios (6 passed)"`。建議在 phase-1 收尾合併時一併改。~~
   **已被協調者反向裁決(`a0e8d80`)**:`expect` 一律**不**釘數字,因為釘死的計數觸犯
   `docs/PITFALLS.md` 坑 1(守門對著會隨正常演化改變的計數)。`06-retrieval` 當時收緊的那條也已
   改回寬鬆。「每個資料夾至少一條且全過」改由 `pnpm accept:coverage` 算出來守。

## 開放問題

- **空 context 的答案是自由文字**(`沒有可引用的來源,無法回答:…`),UI 分不出它與一段真答案。
  這是 E04-S022(abstention)的缺口,`service.ts` 檔頭已明記「本檔不發明結構化 reason code」。
  屬產品行為未定義 → 需使用者裁決,不由本 phase 決定。
- **`rag-composition.test.ts`(真 `retrieve()` → 真 `answer()`,引用不含未授權文件)沒有回填成場景**。
  它是既有且會紅的 vitest 證據,但它斷言的是**兩個能力的組合**,而 `answer()` 從檢索端拿 hits
  依 roadmap 屬 I2/phase-2。放進 phase-1 會讓這個資料夾的場景依賴 `06-retrieval` 的執行期程式碼,
  與「@standalone」的定義相衝。登記為 phase-2 的第一個場景。
- 空 context 短路只在 `answer()` 這一層;`gateway.generate()` 對空 context 仍拋
  `GenerationNoContextError`。兩條規則並存是刻意的(`service.ts` 檔頭),但目前沒有場景釘住
  「繞過 service 直接打 gateway 會拿到 422」——那屬 `04-model-gateway`。
- `plugin.test.ts` 的 **AC-GS4**(可注入替代實作)與 **AC-GS5**(注入 vs 預設雙來源交叉檢查)
  **沒有回填成場景,也沒被列為刻意省略**。它們是接線層(plugin 組裝)不是使用者可見行為,
  本 phase 不主張補場景,但記一筆——免得下一個人以為 `plugin.test.ts` 12 條 vitest 全被
  phase-1 的場景蓋住了(實際只有 AC-GS1/AC-GS2/AC-GS3 綁進了回填對照表)。
