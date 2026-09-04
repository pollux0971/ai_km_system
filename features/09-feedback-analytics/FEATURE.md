# 09 · feedback-analytics

## 一句話

一個人可以對 AI 的回答按「有幫助／沒有幫助」並在否定時挑一個原因;稽核人員看得到這些
回饋彙總成的真實數字與跨擁有者的回饋佇列,其他人連一個數字、一段摘要都拿不到。

## owner

待指派(phase-1 由回填測試 agent 完成,2026-09-04)。

## 範圍

- OK/NG 判定與 `FeedbackReason` enum(`INCORRECT` / `INCOMPLETE` / `OFF_TOPIC` / `OTHER`),
  含「原因不能脫離否定單獨存在」的 fail-closed 前置條件
- usage event 寫入:身分一律取自 session,請求本文帶 `userId` 直接 400
- admin 使用量聚合(DAU / 提問數)與延遲聚合(平均、樣本數、預設 7 天視窗)
- 跨擁有者的回饋佇列讀取模型(auditor / ai_administrator / super_administrator)
- 角色守門:未授權者拿到 403,且**回應本文裡沒有任何數字或答案摘要**
- 回饋摘要上限(200 字),完整答案不得離開伺服器
- reason code → 繁中標籤的共用對應(`packages/api-client/src/feedback-reason.ts`)

## 不在範圍

- 對話與訊息本身的生命週期(→ `03-conversation`)
- 引用層級的 OK/NG(`citationFeedback`,同一組路由但屬 `07-generation` 的引用敘事)
- admin 前端的畫面呈現與互動(→ `10-admin-console`,需要瀏覽器)
- 稽核紀錄與 log(→ `12-audit-observability`)
- 真模型產生的回答(PF3,→ `04-model-gateway`)

## 來源

- 契約:`../../contracts/openapi/analytics.yaml`(usage event、兩個指標、回饋佇列)、
  `../../contracts/openapi/conversations.yaml`(`AnswerFeedbackVerdict`、`FeedbackReason`、
  四條 feedback 路由)
- 舊 story(素材,不是規格):E13-S018～S021、E04-S043、E02-S033、E01-S035、E11-S016
- 規格庫:`../../archive/AI_KM_BMAD_High_Granularity/` 的 E13 章節(唯讀歷史)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@feedback-analytics and @standalone and not @manual'
```

預期輸出:`14 scenarios (14 passed)`。全部在同一個行程內跑真實的 `buildServer()`
(每個場景一個 throwaway SQLite、假 provider),不開 port、不需要模型、不需要瀏覽器。

**注意**:根目錄 `standalone.json` 這一格目前寫成 `... accept -- --tags '...'`。在本
worktree 的 pnpm 11.9.0 上那個 `--` 會原樣傳給 cucumber,cucumber 把後面全部當成路徑,
指令**必定失敗**(06-retrieval 那一格同樣中招,實測過)。見「## 待協調」。

## 依賴

**phase-1(回填)**:`apps/api` 的 composition root(已註冊 `feedbackPlugin` 與
`conversationPlugin`)、`services/feedback`、`services/conversation`、`services/identity`
的示範帳號、`packages/api-client` 的標籤對應。不需要其他能力資料夾。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(回饋掛在真 RAG 答案上) | I2 通過、`07-generation` phase-2 | 現在的 assistant 訊息是測試自己貼進去的字,不是檢索產生的答案 |
| phase-3(admin 畫面) | I5 排程、`10-admin-console` 的瀏覽器場景 | 佇列、儀表板的呈現要人眼看,屬 `@e2e` |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/feedback`、`services/conversation`、`packages/api-client` |
| 測試 | vitest(feedback 4 檔、conversation feedback 2 檔、apps/api wiring 1 檔)+ cucumber `phase-1.feature` 14 場景 | |
| 級別 | **嚴格** | 觸及 RBAC 與資料可見性;失敗模式是「未授權者靜默拿到別人的數字與摘要」 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)OK/NG、reason enum、usage event 身分、指標聚合、403 內容不外洩 | I1 | done | 2026-09-04 |
| 2 | 回饋掛在真 RAG 答案上;佇列裡的 `conversationId` 能跳回那次問答 | I5 | todo | |
| 3 | admin 畫面(佇列、儀表板)的人眼驗收 | I5 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own and stamps the signed-in person onto the event | `apps/api/src/feedback-service-wiring.test.ts`: AC1 POST /v1/usage-events 接受真登入 cookie;`services/feedback/src/routes/usage-events.test.ts`: AC1 owner_key/user_id 來自 session |
| An event that names somebody else as the user is refused before anything is written | `services/feedback/src/routes/usage-events.test.ts`: AC1 帶 `userId` 是 400 |
| Daily active users counts people, not the events they produced | `services/feedback/src/routes/admin-metrics.test.ts`: AC2 兩個人同一天 → DAU 2 |
| The date narrows who was active but not the running question total | `services/feedback/src/repository/usage-events.repository.ts` `computeUsageMetrics` 的明示決定(`date` 只影響 DAU);`admin-metrics.test.ts`: AC2 空日期 0/0 |
| Latency is a real average of the answers inside the window | `services/feedback/src/routes/admin-metrics.test.ts`: AC3 100/200/300 → 200,3 筆 |
| An answer older than the default window leaves the average empty rather than zero | `admin-metrics.test.ts`: AC3 零樣本 → null,0 筆;`days` 預設 7 |
| Widening the window pulls that older answer back into the average | `admin-metrics.test.ts`: `days` 預設 7 並接受明示覆寫(8 天前的樣本在 30 天內) |
| A general user asking for the usage dashboard is handed no numbers at all | `admin-metrics.test.ts`: Security AC general_user 是 403;`services/identity` `requireAnyRole`(E02-S033) |
| The queue is deliberately cross-owner — an auditor triages other people's feedback | `services/feedback/src/routes/admin-feedback.test.ts`: AC4 auditor 看得到 alice 與 bob 兩個擁有者 |
| A general user opening that same queue is handed nobody's feedback | `admin-feedback.test.ts`: AC4 general_user 是 403 |
| The queue carries a short excerpt, never the whole answer | `admin-feedback.test.ts`: Security AC(AC6)`answerExcerpt` 不是全文 |
| A reason code becomes words an admin can read, and an unrecognised code survives unchanged | `packages/api-client/src/feedback-reason.test.ts`: `getFeedbackReasonLabel` 已知碼與未知碼 |
| Rating an answer NG and choosing a reason stores both against that answer | `services/conversation/src/routes/message-feedback.test.ts`: AC1 OK→NG upsert;AC2 NG 時 200 並落地 |
| A reason cannot exist without the rejection it is supposed to explain | `message-feedback.test.ts`: AC2「feedback 不存在或為 OK 時 400」 |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@feedback-analytics and @phase-1 and not @manual and not @e2e'`
  → `14 scenarios (14 passed)`。
- 反向驗證(2026-09-04,手動,cucumber 層級):把 `services/identity/src/require-session.ts`
  的 `if (roles.some((role) => auth.roles.includes(role))) return;` 改成 `if (true) return;`
  (角色守門整個失效)→ 兩個 403 場景紅,而且**第一條炸的是內容斷言不是狀態碼**:

  ```
  ✖ Then the reply carries none of the usage numbers
      AssertionError: 未授權的呼叫者拿到了別人的使用量數字:dailyActiveUsers、questionsAsked;
      回應本文={"date":"2026-08-28","dailyActiveUsers":2,"questionsAsked":3}
  ✖ Then the reply carries none of the rated answers
      AssertionError: 未授權的呼叫者拿到了別人的回饋內容:7812b6a2-…、維修部的答案:保固期為一年。、
      88f7e5b5-…、業務部的答案:潤滑油每三個月更換一次。
  ```

  還原後 `sha256sum` 逐位元相同
  (`e5d5f4dda57e541f214b452aa6a9e599aea15aae8f8ff54c6199edca9e4d3528`),重跑 14/14 綠。
- `@manual`:無。畫面的人眼驗收留到 phase-3。

## 待協調(要協調者改共用檔)

1. **`standalone.json` 的 cucumber 指令在本環境跑不起來**(不只本資料夾,`06-retrieval`
   同樣)。現寫法 `pnpm --filter @ai-km/features accept -- --tags '...'`,pnpm 11.9.0 把
   `--` 原樣往下傳,cucumber 遇到 `--` 就停止解析選項、把 tag 運算式當成檔案路徑,
   exit 1(`ENOENT ... features/@feedback-analytics and @standalone and not @manual`)。
   拿掉那個 `--` 即可,實測 `14 scenarios (14 passed)`。建議措辭:
   `"cmd": "pnpm --filter @ai-km/features accept --tags '@feedback-analytics and @standalone and not @manual'"`,
   並把 `expect` 收緊成 `"14 scenarios (14 passed)"`(比照 06-retrieval 的寫法)。
   `features/README.md` 索引表與 `.claude` 的回填指示裡的同型指令也一起改。
2. **`features/09-feedback-analytics` 需要進 `features/README.md` 的索引**(該表目前把本
   資料夾列為「尚未回填」)。協調者合併時更新。

## 開放問題

- **roadmap 記的「admin 原樣渲染 `INCORRECT`」這個缺陷已經不存在了。**
  `docs/01-roadmap.md` 的 I5 段把「reason code → 繁中標籤」列為 phase-2 待辦,但
  `packages/api-client/src/feedback-reason.ts`(E01-S035,commit `f758968`)已經提供
  `getFeedbackReasonLabel`,而 `apps/admin` 的清單與詳情兩個元件都已經呼叫它。
  本 phase 依「照實寫現況」把它寫成一個會紅的場景並實跑:`INCORRECT` → `答案不正確`,
  未知碼原樣輸出。**建議協調者把 roadmap 那一條劃掉**(那是紀錄落後,不是新修的實作)。
- `computeUsageMetrics` 的 `questionsAsked` **不受 `date` 限制**——它數的是整張表的
  `conversation_message_sent`,只有 DAU 受日期限制。這是 E13-S019 的明示技術決定,
  phase-1 照現況寫成一個場景。但「使用量儀表板上兩個數字用不同的時間範圍」對看儀表板的人
  是會誤解的,是否要在 phase-2 收斂成同一個範圍(需要契約層確認語意)→ 建議走 `/decide`。
- 回饋佇列的 `submittedAt` 目前借用訊息的 `updated_at`(沒有專屬的回饋時間欄位)。
  之後若要做「這週的回饋」統計,這個借用會失準——屬 phase-2 的資料模型問題。
- 本 phase 的 assistant 訊息是直接以 `role: "assistant"` 建立的字串,不是 RAG 產生的答案;
  「對真答案按 NG」要等 I2/`07-generation` phase-2。
