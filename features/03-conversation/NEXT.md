# 03 · conversation — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填,11 場景) |
| 進行中 | 無 |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(組裝後的 apps/api + 送訊息 → RAG 回答帶 citations)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 自身:`01-identity` phase-1 `done` —— phase-2 要在真的 `buildServer()` 上用**兩個不同身分**
      跑擁有者拒絕的場景,目前 `_world.ts` 的 `startServer({ enableTestAuthProvider: true })`
      只有 demo 使用者一條登入路徑,換身分的方式還沒有回填成步驟
- [ ] 整合:`06-retrieval` phase-2 與 `07-generation` phase-2 `done` —— 訊息要帶得出 citations
- [ ] 契約:`contracts/openapi/conversations.yaml` 的 `Message` 目前**沒有** citations 欄位
      (`docs/01-roadmap.md` 的 I2 表格自己標了「待 `/feature` 分流確認」)。
      這是**放寬契約**,依 CLAUDE.md 決策權表要**使用者**拍板,不是技術顧問。
      未拍板前不得自行加欄位。
- [ ] 契約:`ResyncEvent.reason` 的 `SERVER_RESTART` 是保留值還是缺一段實作(見 FEATURE.md
      開放問題)。這條**不擋 phase-2**,但要在 phase-2 的 ADR 裡標成已知落差。

**phase-3(回饋寫入面與 admin 讀取模型)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:`09-feedback-analytics` phase-1 `done`(回饋的欄位與指標規格在那裡,
      這裡只回填寫入面,避免兩個資料夾各寫一半)
- [ ] 契約:無新契約需求(`conversations.yaml` 已有 feedback 欄位)

## Gate 未滿足時

**phase-2 卡在 citations 契約 + 01-identity**:不要先用一個假的 `citations` 欄位把訊息塞回去
——那正是「發明 contract」。在使用者拍板前可以先做的,依序是:

1. **把 `apps/api` 這一層的接縫回填成場景**(不需要新契約):`apps/api/src/domain-plugin-registration.test.ts`
   的 AC1/AC2 已經證明「契約沒載入 ⇒ 404 而非 500」「契約載入 ⇒ 401 而非 404」。
   用 `common.steps.ts` 的 `a fresh server with fake providers` + `a {string} request is sent to {string}`
   兩句通用步驟就寫得出來,一行實作都不用改。
2. **把 SSE 的連線上限與斷線清理(AC6/AC7)搬進來**,如果 phase-2 決定在 `apps/api` 上重測。
3. **把契約回應驗證接進場景**:`testing/contract-check.ts` 的 `expectResponseMatchesContract`
   已經在 vitest 裡對每個狀態碼跑過,phase-2 可以在「建立對話」「送訊息」兩條主幹上再跑一次,
   讓契約漂移在驗收層也會紅。

**不可以先做的**:自行在 `Message` 上加 citations、自行送 `SERVER_RESTART` resync、
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

## 完成後

phase-2 完成即補上 I2 的最後一塊(`docs/01-roadmap.md` 的 I2 表格裡 `03-conversation/phase-2`
那一列),使用者就能在 apps/web 登入、提問、讀到帶引用的答案。
phase-3 完成即解鎖 I5 的回饋與 admin 指標。
