# 03 · conversation

## 一句話

一個人開一個對話、把訊息送進去、把 AI 的回答改寫成更好的版本,而他開著的每一個視窗
都會即時看到同一份變更;斷線的視窗回來時,不是被補齊就是被要求整份重抓,絕不會拿到
一份看起來完整、其實有洞的紀錄。而這一切只發生在他自己的資料上。

## owner

待指派(phase-1 由回填 agent 完成,2026-09-04)。

## 範圍

- 對話 CRUD:建立(伺服器指派標題／模式／模型預設值)、讀取、更新(標題 trim、模式、
  知識範圍、模型、封存)、刪除(連同訊息)
- 訊息:送出使用者訊息與 AI 回答、連動更新對話的 `lastMessagePreview` / `lastMessageAt`
- 修訂:改寫 AI 回答,舊內容依序留在 `revisions`(由舊到新)
- 變更紀錄:每個寫入都在**同一筆交易內**追加一筆 per-owner、無跳號的 `seq` 事件
- SSE 變更串流 `GET /v1/conversations/events`:即時推送、`Last-Event-ID` 重播、
  兩種 `resync` 理由、每 owner 20 條連線上限、斷線清理
- 擁有者範圍(fail closed):branded `OwnerKey` + `prepareOwnerScoped` 的 SQL 守門;
  別人的對話一律 403(不是 404、不是空清單、不是靜默過濾)
- 訊息回饋(OK/NG、原因、註解、逐引用回饋)與 admin 讀取模型(素材已存在,尚未回填成場景)
- sandbox 種子資料(`seedSampleConversations` / `seedSampleMessages`,uuid-v5)

## 不在範圍

- 送訊息之後真的去 RAG 拿答案與引用(→ `06-retrieval` / `07-generation`,I2 的最後一塊)
- 從身分推導部門／群組授權(→ `02-authorization`);本能力的可見性單位是 `ownerKey`,不是部門
- 跨行程 fan-out(Redis 之類):`ChangeEventBus` 明示只在單一 `apps/api` 行程內
- 前端的對話視窗與跨視窗行為(→ `11-app-shell`)
- 回饋指標的聚合與 admin 圖表(→ `09-feedback-analytics`)

## 來源

- 契約:`contracts/openapi/conversations.yaml`;SSE 線路格式與重播語意的規範性文件是
  `contracts/events/conversation-change-events.md`
- 舊 story(素材,不是規格):E04-S040(schema + owner scope + 事件紀錄)、S041(對話 REST)、
  S042(訊息與修訂)、S043(回饋)、S044(SSE 串流)、S049/S050/S051(裝飾器順序與條件註冊)、
  S072(SSE wire 型別)
- 實作:`services/conversation/`(36 個 src 檔、16 個 test 檔);composition root 的
  條件註冊在 `apps/api/src/server.ts`

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@conversation and @standalone and not @manual'
```

預期輸出:`11 scenarios (11 passed)`。全部 in-process:記憶體 SQLite(真的跑
`db/migrations/202608280001_conversation_domain.sql`)、真的 `conversationPlugin`、
真的路由,SSE 場景會在 `127.0.0.1` 上開一個隨機埠。不需要模型、不需要外部 DB。

根目錄 `standalone.json` 的 `03-conversation` 這一行與上面逐字相同,`expect` 是寬鬆的
`scenarios (`——cucumber 選不到場景時印的是 `0 scenarios`(沒有 ` (` 那半),所以寬鬆式
已經排除空選集,而釘死「N scenarios (N passed)」會在每次正常加場景時假紅
(PITFALLS 坑 1)。「每個資料夾至少一條且全過」由 `pnpm accept:coverage` 守。

## 依賴

**phase-1(回填)**:只依賴 `services/conversation/src`、`contracts/openapi/conversations.yaml`
與 `db/migrations/202608280001_conversation_domain.sql`。不依賴其他能力資料夾。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(組裝後的 apps/api:真 cookie session、真錯誤信封、送訊息→RAG 回答) | I1 通過(已)、`01-identity` phase-1、`06-retrieval` phase-2、`07-generation` phase-2 | 訊息要帶 citations 才有 I2;真 session 才能在 `buildServer()` 上跑多個身分 |
| phase-3(回饋與 admin 讀取模型) | `09-feedback-analytics` phase-1 | 回饋的欄位與指標聚合是那個資料夾的規格,這裡只負責寫入面 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/conversation/src` |
| 儲存 | better-sqlite3(記憶體)+ 真實 migration | 測試不手抄 schema,直接讀 `db/migrations/*.sql` |
| 串流 | 原生 SSE(`reply.hijack()`)+ 行程內 `ChangeEventBus` | 跨行程 fan-out 是明示的非目標 |
| 測試 | vitest 16 檔 + cucumber `phase-1.feature` 11 場景(含 1 個 Scenario Outline) | |
| 級別 | **嚴格** | 觸及資料可見性(別人的對話、別人的變更串流);失敗模式是靜默——擁有者比對壞掉時 API 照樣回 200,串流照樣送,沒有任何東西會報錯 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)掛載、對話預設值、訊息連動、修訂順序、擁有者拒絕、SSE 即時／重播／resync、回捲不外洩 | I1 | done | 2026-09-04 |
| 2 | 組裝後的 apps/api(真 session、真錯誤信封)+ 送訊息 → RAG 回答帶 citations | I2 | todo | |
| 3 | 回饋寫入面與 admin 讀取模型回填 | I5 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The conversation domain mounts on a bare server and answers there | `testing/build-test-app.ts`(每個 route 測試的 harness,`app.register(conversationPlugin)` → `ready()` → `hostChangeEventBus(app)`)。**只綁到這一個**:場景走的是 bare Fastify 直接 `register(conversationPlugin)`。`apps/api/src/domain-plugin-registration.test.ts` 的 AC1/AC2 斷言長得很像(404 vs 401),但它走真的 `buildServer()` 與**條件註冊**,是**另一個入口**,本場景抓不到那一層的回歸——那一層留在 phase-2(見 NEXT.md「Gate 未滿足時」第 1 項) |
| Starting a conversation gives it the server's own defaults and one entry in the change log | `routes/conversations.test.ts`: AC5「201 with contract defaults when no body is sent」;`routes/conversations.test.ts`: AC10「records origin_client_id」的同一條事件路徑 |
| Sending a message moves the conversation's preview forward and records both changes in order | `routes/messages.test.ts`: AC2「creates a user message and updates the conversation's preview/lastMessageAt」、AC6「creates 2 change events (message.created, conversation.updated) in one transaction」 |
| Revising an answer keeps every earlier wording, oldest first | `routes/messages.test.ts`: AC5「revises an assistant message, oldest content first, accumulating across 2 revisions」 |
| Another person's conversation is refused outright, not quietly shown as empty | `routes/conversations.test.ts`: AC9「403s (not 404, not empty) for another owner's conversation」。**只綁到這一條**:`lookupConversation()` 刻意用裸 `db.prepare(SELECT … WHERE id = ?)`(該檔自己註明是 `prepareOwnerScoped` 的例外,因為要先看見 `owner_key` 才分得出 403 與 404),所以 `repository/owner-scope.test.ts` 那個 fail-closed SQL 守門**不在這個場景的路徑上**,由它自己的 vitest 覆蓋——見 NEXT.md 未回填清單 |
| A second window is told about a new conversation the moment it is created | `routes/change-events.test.ts`: AC2「a live change event arrives with id=seq, event=type, and valid JSON data」 |
| A second window is never told about somebody else's conversation | `routes/change-events.test.ts`: AC4「never receives another owner's events」 |
| Reconnecting with a checkpoint replays only what was missed, in order | `routes/change-events.test.ts`: AC3「Last-Event-ID replays only strictly-newer events, in order」;`repository/change-events.repository.test.ts`「returns seq 51..70 for (after=50, limit=20)」 |
| A checkpoint the server cannot honour asks for a full re-fetch(Outline × 2) | `routes/change-events.test.ts`: AC9「an id never issued to this owner triggers UNKNOWN_LAST_EVENT_ID」與 AC9「more than 500 pending events … triggers EVENT_LOG_TRUNCATED」 |
| A conversation write that rolls back is never announced and leaves nothing behind | `events/emit-after-commit.test.ts`: AC8「a subscriber receives nothing when the write's transaction rolls back」 |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@conversation and @phase-1 and not @manual and not @e2e'`
  → `11 scenarios (11 passed)`。
- `@manual`:無。
- 反向驗證(2026-09-04,手動,cucumber 層級;`tools/mutate.mjs` 只驅動 vitest):

  **(a) 擁有者比對(嚴格級的那條)** —
  `services/conversation/src/repository/conversations.repository.ts` 的
  `lookupConversation()` 拿掉 `if (raw.owner_key !== owner) return { outcome: "forbidden" };`
  → 場景 *Another person's conversation is refused outright* 紅在第一條斷言:

  ```
  AssertionError [ERR_ASSERTION]: 狀態碼應為 403,實際 200:
  {"id":"69107d8d-7dc1-463d-827d-9a80bde49390","title":"新對話","mode":"normal",…}
  200 !== 403
  ```

  紅的是身分(bob 拿到了 alice 的整筆對話,連 id 與標題都在回應裡),不是副作用。
  還原後 sha256 相同(`6782ecf7…f145b`),11/11 綠。

  **(b) 重播邊界** — `repository/change-events.repository.ts` 的
  `WHERE owner_key = ? AND seq > ?` 改成 `seq >= ?` → 場景
  *Reconnecting with a checkpoint replays only what was missed, in order* 紅在:

  ```
  AssertionError [ERR_ASSERTION]: 重播的變更編號應為「4, 5, 6, 7, 8, 9, 10」,實際「3, 4, 5, 6, 7, 8, 9, 10」
  ```

  紅的是**順序與內容**(多重播了客戶端已經看過的第 3 號),不是「有沒有收到東西」——
  這條實作壞掉時串流照樣有框、照樣有順序,會變的只有那串數字。還原後 sha256 相同
  (`83904dce…c6f38`),11/11 綠。

## 待協調(要協調者改共用檔的)

1. ~~`features/steps/common.steps.ts` 的 plugin 註冊通用步驟無法使用~~ —— **協調者已於 2026-09-04 修好**
   (pattern 有一個 `{string}`、handler 宣告 0 個參數,cucumber 執行期判
   `function has 0 arguments, should have 1`;現在 handler 收 `name` 了)。
   本資料夾的 mount 場景仍用自己的一句
   `the conversation domain is mounted on a bare server and that server becomes ready`
   ——它做的事與通用句子完全相同(真 `register()` → `ready()`,結果放進
   `this.bag["registeredApp"]`,通用的 Then 照讀)。換回通用句子要改 `features/steps/`,
   留給 phase-2 一併處理,不在這次 follow-up 的範圍。

2. ~~根目錄 `standalone.json` 的非互動指令在 pnpm 11.9.0 下必定失敗~~ —— **協調者已於 2026-09-04 修好**
   (`accept -- --tags` 改成 `accept --tags`)。原先本檔另外建議把 `expect` 從
   `"scenarios ("` 收緊成 `"11 scenarios (11 passed)"`,**那個建議是錯的,已撤回**:
   cucumber 選不到場景時印 `0 scenarios`(沒有 ` (` 那半),寬鬆式本來就排除得掉空選集,
   而釘住 11 會在每次正常加場景時假紅(PITFALLS 坑 1)。

3. **`services/conversation/src/testing/build-test-app.ts` 不能被 `features/` 用字面路徑 import**。
   `_world.ts` 會 `await import("../../apps/api/src/server.js")`,所以 apps/api 的
   `declare module "fastify"`(`contracts: ContractRegistry`)已經在 features 的型別程式裡;
   build-test-app 裝的是只有 `getSchema` 的窄物件,兩者放進同一個程式就是
   `Type '{ getSchema… }' is missing … specNames, getResponseSchema, validateResponse`。
   這是 `plugin-types.ts` 開頭那段註解預告過的跨 package 衝突,不是這次回填造成的。
   目前本檔用「變數當 specifier」的動態 import 迴避(執行期同一個入口,型別上不拉進來),
   並在步驟檔裡寫明理由。若要根治,建議由 domain owner 把那個 harness 的 contracts
   decorator 補成完整的 `ContractRegistry` 形狀,或讓 `features/tsconfig.json` 不與
   apps/api 的 augmentation 同程式——兩者都動到本工單不得修改的檔。

## 開放問題

- **`ResyncEvent.reason` 的 `SERVER_RESTART` 沒有任何實作路徑會送出**。契約
  (`contracts/openapi/conversations.yaml` `ResyncEvent`)列了三個值,
  `routes/change-events.ts` 只送 `UNKNOWN_LAST_EVENT_ID` 與 `EVENT_LOG_TRUNCATED`。
  它是保留值還是缺一段實作(行程重啟後 `seq` 仍在 DB、bus 空掉),要由使用者裁決。
  **本工單不動契約,也不動實作**,phase-1 只回填實際會送出的兩個。
- 訊息回饋(`routes/message-feedback.ts`)與 admin 讀取模型(`repository/admin-read.repository.ts`)
  有完整的 vitest,但它們的規格屬於 `09-feedback-analytics`。要放在哪個資料夾回填,
  等那個資料夾的 phase-1 落地後再議(暫記在 NEXT.md 的 phase-3)。
- SSE 的每 owner 20 條連線上限(AC6)與斷線清理(AC7)沒有回填成場景:它們要在
  cucumber 裡開 21 條真連線,成本與價值不成比例,而 vitest 已經涵蓋。若之後 phase-2
  在 `apps/api` 上重測連線上限,再考慮搬過來。
