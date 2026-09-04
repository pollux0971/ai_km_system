# 07 · generation — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04)、phase-2(2026-09-05,獨立驗收 PASS) |
| 進行中 | 無 |
| 下一個 | phase-3(結構化 abstention) |

## 下一個 phase 的 gate

**phase-2(`answer()` 從 `app.retrieval` 拿 hits,接進 `apps/api` composition root)** 需要全部滿足:

- [ ] 自身:phase-1 狀態為 `done`
- [x] 整合:[`06-retrieval`](../06-retrieval/NEXT.md) phase-2 `done`(**已滿足**,2026-09-04)
      ——`retrievalPlugin` 已註冊進 `apps/api` composition root,`app.retrieval` 存在
- [x] 整合:I1 已通過(**已滿足**,2026-09-03)
- [x] 契約:`conversations.yaml` 的 `Message` 加**選填** `citations[]` —— **gate 已解除**。
      ADR 0013 裁決表 #10 已批(「回應側新增選填欄位,對既有消費端相容」,schema 對齊
      `generation.yaml` 的 `Citation`),且 ADR 0013 把契約放寬從使用者級改為技術顧問級。
      落地時仍要走 `/decide` 記 ADR,並注意兩件機械後果:
      (a) `Message` 目前是 `additionalProperties: false`,所以**契約必須先放寬,實作才能送
      `citations`**——順序不能反;
      (b) 新增的 schema 會被 `pnpm contract-gate` 的 check 3 判為 UNBOUND,必須同時做
      L0/L2/transcribed 其中一種綁定,否則 gate 紅(見 `contracts/openapi/__checks__/README.md`)。

**phase-2 的 DoD 追加兩條(2026-09-04,技術顧問覆核後裁定;是 DoD,不是「順手做」)**

- [ ] **`service.test.ts` AC2 的斷言換形狀。** 現況 `.rejects.toBeInstanceOf(FabricatedCitationError)`
      是 **E06-S043 的同一個形狀**:反向驗證時第一條炸的是
      `Error: promise resolved "{ answer: '...', …(1) }" instead of rejecting`
      ——只證明「有拋錯」,而捏造的 `doc-does-not-exist#0` **從未被比對過**
      (它被 vitest json reporter 截斷在 `…(1)` 裡)。

      改成:`try/catch` 捕錯後**先**斷言 `message` 含捏造的 chunkId **字面**,
      **再**斷言型別。順序是重點——GHERKIN_WORKFLOW §5.2:同一個測試裡
      **第一條炸的決定了紅的意義**,決定性比對要排在最前面。

      **驗收條件**:反向驗證必須紅在「**訊息裡沒有那個 chunkId**」,
      不是紅在「沒拋錯」。紅在後者就等於沒改。

**phase-2 另外必須做的一件事(2026-09-04,由 `06-retrieval/phase-2` 的獨立驗收 session 發現)**:

- [ ] 把 ADR 0014 的固定 `dept:eng` 從 `features/steps/retrieval.steps.ts` 的
      `askThroughRealSeam()` **搬進 `apps/api` 的 composition root**,並把
      `06-retrieval/phase-2.feature` 的場景 4 重新指向那條生產路徑。

      理由:場景 4 自稱是「這個固定值的移除條件」,ADR 0014 的 Consequences 表也指望它。
      但固定值今天寫在 step 檔裡、繞過生產碼直接呼叫 `app.retrieval.retrieve()`,而
      `retrieve()` 是確定性函式——所以那條斷言**對生產碼的任何改動都不會變化**。
      它會紅,只是紅不紅與它宣稱要守的東西無關(§5.2 的變形:一個從未因它要守的東西而
      紅過的守門不算守門)。`answer()` 是第一個真正呼叫 `retrieve()` 的生產路徑,
      所以搬遷的落點就是這個 phase。詳見 [ADR 0014](../../docs/adr/0014-i2-fixed-demo-scope.md)
      的「這份 ADR 的一個空保證」段。

**phase-3(abstention:沒有來源時回結構化理由)** 需要:

- [ ] 自身:phase-2 `done`
- [x] 契約:E04-S022 的回應形狀 —— **gate 已解除**。ADR 0013 裁決表 #12 已批:
      無來源時回**結構化 abstention**,回應加 `abstained: true` + `abstentionReason` enum
      (`NO_AUTHORISED_SOURCES`、`INSUFFICIENT_CONTEXT`),UI 以此區分、不靠字串比對;
      `generation.yaml` 走 `/decide`。閾值本身是工程取捨,依 ADR 0013 由顧問/協調者定。

## Gate 未滿足時

**phase-2 卡在 `06-retrieval` phase-2**:不要在 `services/generation` 裡自己去 new 一個
retrieval service 來「先接起來」——那會在這個資料夾裡長出第二個決定可見性的地方,正是
`service.ts` 檔頭第 3 點禁止的。

gate 未滿足時**可以先做**:

- 把 `rag-composition.test.ts`(真 `retrieve()` → 真 `answer()`,最終引用不含未授權文件)
  寫成 phase-2 的第一個場景(紅),步驟綁到 `app.retrieval` / `app.generation` 兩個接縫。
- 上一項要求跨資料夾共用「seed 一個檢索 store」的句子,那是共用步驟的訊號:寫進本檔與
  `FEATURE.md` 的「待協調」,由協調者搬進 `common.steps.ts`,**不要 import 別的能力資料夾的 steps**。

**不可以先做**:在 `services/generation` 裡加任何 scope 判斷;把空 context 的自由文字改成
結構化 reason code(那是 phase-3——**不再是「等使用者」,是「等 phase-2 先 done」**,見上)。

**改 `contracts/openapi/*.yaml`**:2026-09-04 起不再是絕對禁止,但**仍然要走 `/decide` 記 ADR**,
而且順序是「契約先、實作後」。ADR 0013 把契約放寬與新 endpoint 改為技術顧問級;
**唯一仍留給使用者的是付費/外部服務與整合點 `@e2e` 親手驗收**。

## 完成後

phase-2 完成後,I2 只剩 `03-conversation` phase-2(送訊息 → RAG 回答 → 訊息帶 citations)
與 `11-app-shell` phase-2(引用可點)。phase-3 完成後,「查無資料」與「有資料但答不出來」
在 UI 上第一次分得開。
