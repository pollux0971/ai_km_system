# 03 · conversation — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04)、phase-2(2026-09-05,獨立驗收 PASS)。原文:phase-1(2026-09-04,回填,11 場景) |
| 進行中 | phase-4:**紅規格已交件**(`ab8b363`,3 紅 2 綠),實作待派 |
| 下一個 | **phase-4 —— 已做完,場景 5/5 綠,卡在合併,而且它戳破了一個前提**(branch `pollux0971/03-p4-dev`,`3a96c14`)。見 `DECISIONS_NEEDED` #47:收緊 `role` enum 之後 **`apps/web` 編譯不過**——`receiveAssistantReply` 的函式本體、匯出、型別依賴與約 50 條專屬測試**全部還在**,`11-app-shell/phase-3` 只是**繞開了呼叫路徑**。**ADR 0017 第二步第 1 件的「移除」從來沒有真的做。** 需要一個 `apps/web` 的小 phase 先把它刪掉 |

> 2026-09-05 更正:「下一個」原本寫 `phase-2`,而 phase-2 已 `done`。同上,`/sprint` 讀本檔。

## 下一個 phase 的 gate

**phase-2(組裝後的 apps/api + 送訊息 → RAG 回答帶 citations)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 自身:`01-identity` phase-1 `done` —— phase-2 要在真的 `buildServer()` 上用**兩個不同身分**
      跑擁有者拒絕的場景,目前 `_world.ts` 的 `startServer({ enableTestAuthProvider: true })`
      只有 demo 使用者一條登入路徑,換身分的方式還沒有回填成步驟
- [x] 整合:`06-retrieval` phase-2(2026-09-04)與 `07-generation` phase-2(2026-09-05)
      皆 `done` —— `app.rag.ask(question)` 已經是真的生產路徑,訊息帶得出 citations

**phase-2 的 DoD 追加一條(2026-09-05,由 `07-generation/phase-2` 的獨立驗收 session 挖出)**

- [ ] **`app.rag.ask()` 要長出 caller identity 參數,ADR 0014 的固定 `dept:eng` 從 seam 內部
      搬到這裡的 HTTP 呼叫點。**

      理由不是美觀,是**一個守門今天是死的**:驗收者實際把 `rag-plugin.ts` 改成「兩個人拿到
      不同 scope」,`06`/`07` 的場景 4(ADR 0014 自稱的「移除條件」)**仍然全綠**。
      兩個原因,第一個已經解掉、第二個沒有:

      1. ~~store 永遠是空的~~ —— `05-ingestion/phase-2` 接上 `app.ingestion` 之後不成立了;
      2. **`RagSeam.ask(question)` 沒有 caller identity 參數** —— 就算之後真的要依人推導 scope,
         這個簽名也接不到「這是誰」。所以那條場景**不管固定值在不在,都會綠**。

      `03-conversation/phase-2` 是**第一個手上真的有「登入的人」的呼叫點**,所以簽名變更的
      落點在這裡。做完之後,`06`/`07` 的場景 4 才第一次有可能成為真的守門
      ——**但改那兩個 `.feature` 的文字要走 `/feature`**(§6),不是這個 phase 順手改。

      在此之前,ADR 0014 的「移除條件」信心一律標**「未證實」**,不得寫成「已驗證」。

- [ ] **本 phase 的反向驗證形狀已由技術顧問指定(2026-09-05),是 DoD 不是選配**:
      `ask(question, caller)` 落地後,把 `rag-plugin` 改成**「兩個人拿到同一 scope」**,
      兩個身分的場景**必須紅**,而且**失敗訊息要印出兩個人各自拿到的 scope key**。

      這正是獨立驗收 session 在 `07-generation/phase-2` 做過的那個實驗**反過來**:
      它當時把實作改成「兩個人拿到不同 scope」,場景仍然 4/4 全綠——證明那條斷言是死的。
      本 phase 要讓同一個實驗的反方向**真的會紅**,才算把它救活。

      **本 phase 為嚴格級**(觸及授權範圍),依 §5.1 由另一個 session 驗收。
- [x] 契約:`contracts/openapi/conversations.yaml` 的 `Message` 加**選填** `citations[]`
      —— **gate 已解除(2026-09-04)**。

      ⚠️ **本條在 2026-09-04～09-05 之間是過期的**,原文寫「這是放寬契約,依 CLAUDE.md
      決策權表要**使用者**拍板,不是技術顧問」。那句話在 ADR 0013 之後就不成立了:
      ADR 0013 把契約放寬／新 endpoint／新 schema 從使用者級改為**技術顧問級**,
      使用者只留**付費**與**整合點 `@e2e` 親手驗收**兩類;同一份 ADR 的裁決表 #10
      已經明批「`Message` 加選填 `citations[]`(回應側新增選填欄位,對既有消費端相容),
      schema 對齊 `generation.yaml` 的 `Citation`」。

      **這個過期造成了實際後果,記在這裡不是為了自責**:2026-09-05 派 `07-generation/phase-2`
      時,測試 agent 讀了本檔這一段,據此判斷「03-conversation 卡在使用者、沒有時間表」,
      並把它列為選擇讀法 1(固定 scope bake 進組合 seam)的**第一條理由**。
      結論本身仍站得住(另外兩條理由獨立成立),但那條理由是錯的。
      協調者 2026-09-04 更新了 `07-generation/NEXT.md` 的同一條 gate,漏了本檔——
      **NEXT.md 的 gate 是 agent 真的會照著做決定的東西,不是給人看的摘要。**

      落地時的兩個機械後果(與 07 的 NEXT.md 同):
      (a) `Message` 目前是 `additionalProperties: false`,所以**契約必須先放寬,實作才能送
      `citations`**,順序不能反;
      (b) 新增的 schema 會被 `pnpm contract-gate` 的 check 3 判為 UNBOUND,必須同時做
      L0/L2/transcribed 其中一種綁定,否則 gate 紅。
- [ ] 契約:`ResyncEvent.reason` 的 `SERVER_RESTART` 是保留值還是缺一段實作(見 FEATURE.md
      開放問題)。這條**不擋 phase-2**,但要在 phase-2 的 ADR 裡標成已知落差。

**phase-3(回饋寫入面與 admin 讀取模型)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:`09-feedback-analytics` phase-1 `done`(回饋的欄位與指標規格在那裡,
      這裡只回填寫入面,避免兩個資料夾各寫一半)
- [ ] 契約:無新契約需求(`conversations.yaml` 已有 feedback 欄位)

## Gate 未滿足時

**phase-2 現在卡的是 `07-generation` phase-2,不是 citations 契約**(契約 gate 已於 2026-09-04
由 ADR 0013 #10 解除,見上)。仍然不要先用一個假的 `citations` 欄位把訊息塞回去——
那正是「發明 contract」;正確順序是走 `/decide` 把選填欄位加進 `conversations.yaml`、
同時補上 binding,**契約先、實作後**。在 `07-generation` phase-2 落地前可以先做的,依序是:

1. **把 `apps/api` 這一層的接縫回填成場景**(不需要新契約):`apps/api/src/domain-plugin-registration.test.ts`
   的 AC1/AC2 已經證明「契約沒載入 ⇒ 404 而非 500」「契約載入 ⇒ 401 而非 404」。
   用 `common.steps.ts` 的 `a fresh server with fake providers` + `a {string} request is sent to {string}`
   兩句通用步驟就寫得出來,一行實作都不用改。
2. **把 SSE 的連線上限與斷線清理(AC6/AC7)搬進來**,如果 phase-2 決定在 `apps/api` 上重測。
3. **把契約回應驗證接進場景**:`testing/contract-check.ts` 的 `expectResponseMatchesContract`
   已經在 vitest 裡對每個狀態碼跑過,phase-2 可以在「建立對話」「送訊息」兩條主幹上再跑一次,
   讓契約漂移在驗收層也會紅。

**不可以先做的**:**不走 `/decide`** 就在 `Message` 上加 citations(契約 gate 已解除不等於
可以直接改 yaml——仍要 ADR 留痕 + 同時補 binding)、自行送 `SERVER_RESTART` resync
(ADR 0013 #13 裁定它是**保留值**,契約 description 註明即可,實作不補)、
自行改 `standalone.json` 或 `common.steps.ts`(見 FEATURE.md「待協調」)。

## 沒有寫進 phase-1 的行為(→ phase-2 / phase-3)

以下都有既有 vitest 覆蓋,但**不是主幹**(邊界條件、清單參數、尚未組裝的那一層),
照 `features/README.md` 「一個 phase 少於 3 或多於 15 個場景都要懷疑」留在 vitest,
不一條一條搬進 Gherkin:

- 清單參數:分頁(`page`/`pageSize`、超出範圍)、`q` 標題子字串搜尋(含只有空白的 q)、
  `archived` 切換、`totalCount`/`totalPages` 反映的是篩選後的集合
- 更新與刪除:標題 trim 後為空 → 400 且資料不變、標題 >120、未知 `mode`/`knowledgeScopes`、
  空 body 是真的 no-op、封存/解封存來回、`DELETE` 204 後 `GET` 404 且訊息一併消失、
  `conversation.deleted` 事件
- 訊息邊界:內容 >20000、`attachmentNames` 超過契約上限 10、AI 回答不得帶附件、
  使用者訊息不得帶 `state`、內容與附件都空 → 400、未知 `state` 列舉值、未知 body 欄位
- 修訂邊界:修訂使用者訊息 → 400、訊息不屬於該對話 → 404
- `X-Client-Id` 的 `originClientId` 回音(untrusted echo,不是身分)
- SSE:心跳框、每 owner 20 條連線上限 → 429 `TOO_MANY_CONNECTIONS`、斷線後 bus 監聽器歸零、
  `lastEventId` 剛好等於最新 seq 時不重播也不 resync
- 回饋:OK/NG、原因列舉、註解、逐引用回饋、admin 讀取模型分頁(→ 併入 `09-feedback-analytics` 討論)
- sandbox 種子:`seedSampleConversations` / `seedSampleMessages` / `uuidV5`(→ 併入 `01-identity` 的
  sandbox 討論)
- 組裝後的那一層:真 cookie session、`apps/api` 的錯誤信封、條件註冊(→ phase-2 第 1 項)
- **`prepareOwnerScoped` 的 fail-closed SQL 守門**(拒絕沒有 `owner_key` 述詞的
  SELECT/UPDATE/DELETE、拒絕沒寫 `owner_key` 欄位的 INSERT、不被字串字面值與註解騙過),
  留在 `repository/owner-scope.test.ts`(16 條)。**phase-1 的任何場景都不會因為它消失而紅**
  ——2026-09-04 獨立審核實測:把 `prepareOwnerScoped` 降級成直通 `db.prepare`,11 條全綠、
  exit 0。原因是唯一會踩到「別人的資料」的那條路徑(`lookupConversation()`)刻意**不走**
  這個 helper(要先看見 `owner_key` 才分得出 403 與 404,該檔自己註明是例外)。
  這條登記在這裡,是因為它是**嚴格級**守門而驗收層蓋不到——phase-2 若要把它拉進驗收層,
  需要一個從路由打進去、能證明「少了 owner_key 述詞就拒絕 prepare」的場景。

## 完成後

phase-2 完成即補上 I2 的最後一塊(`docs/01-roadmap.md` 的 I2 表格裡 `03-conversation/phase-2`
那一列),使用者就能在 apps/web 登入、提問、讀到帶引用的答案。
phase-3 完成即解鎖 I5 的回饋與 admin 指標。
