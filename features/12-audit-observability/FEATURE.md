# 12 · audit-observability

## 一句話

不必打開任何人的資料就能知道系統活著、壞在哪、以及誰在什麼時候做了什麼——
未登入的人問「還活著嗎」得到一個不洩漏內部拓樸的答案,持有操作者角色的人才看得到
四個子系統的細節,而 log 本身從不寫下 cookie、bearer token 或密碼。

## owner

待指派(2026-09-04 由 phase-1 回填 agent 建立)。

## 範圍

- `GET /v1/health`:免登入的維運端點,永遠 200(每條 lane 的 E2E setup 用 `curl -sf` 輪詢它),
  以 body 的 `status` 攜帶健康與否,欄位只有 `status`／`version`／`uptimeMs`
- `GET /v1/admin/health`:角色守門的詳細報告,四個子系統(`api`／`database`／`migrations`／`asr`)
  逐一具名;角色清單抄自 `contracts/openapi/analytics.yaml` 的 `x-required-roles`
- 子系統檢查與聚合(`apps/api/src/health/checks.ts`):任一 `down` → 整體 `degraded`,
  但 HTTP 狀態碼不動
- trace id(`x-correlation-id`)串接:呼叫端給的 id 原樣沿用並回送、進到該次請求的每一行 log;
  畸形的 id(可用來偽造 log 行的)被丟掉換成新造的 uuid v4
- log 衛生(鐵律 2 的一半:**未授權資料不進 log**):cookie、authorization header、
  request body 都不進 log;pino 的 `redact` 與 `serializers.req` 兩層

## 不在範圍

- **稽核事件本身**(誰在何時問了什麼、看到哪些文件、答案引用了什麼):`services/audit` 不存在,
  舊規格庫的 E14-S001／S002 是 Team B 從未實作的。這是 phase-3 / I7 的內容,見 `NEXT.md`
- admin 的稽核檢視器 UI(`apps/admin/src/lib/audit.ts` 的 `listAuditEvents()` 永遠回空)
  → `10-admin-console`(story-to-capability-map 把 E11-S015 歸在那裡)
- 前端／BFF 的 correlation id middleware(`apps/web`、`apps/admin`)→ `11-app-shell`
- 使用量事件與 admin 指標聚合 → `09-feedback-analytics`
- 登入、session、角色本身的定義 → `01-identity`

## 來源

- 契約:`contracts/openapi/analytics.yaml` 的 `/admin/health`(含 `x-required-roles`)。
  **`GET /v1/health` 沒有登記進任何契約**——見「開放問題」。
- 舊 story(素材,不是規格):story-to-capability-map **一列都沒有歸到本資料夾**;
  實際素材落在被歸給別的資料夾的平台 story(E04-S039 correlation／log、E04-S047 health、
  E02-S033 `requireAnyRole`、E13-S018 subsystem 契約形狀)。
- 規格庫:`archive/AI_KM_BMAD_High_Granularity/` 的 E14 章節本體從未寫完(`SOURCE_BASELINE.md`
  在到達 E14 之前就結束),所以稽核事件的規格今天並不存在。

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@audit-observability and @standalone and not @manual'
```

預期輸出:`9 scenarios (9 passed)`。全部在 process 內跑真實的 `buildServer()` + `inject()`,
SQLite 是每個 scenario 自己的暫存檔,語音 sidecar 用 `AI_KM_ASR_PROVIDER=fake`,不開 port、
不需要模型、不打任何外部網路。

> **注意**:根目錄 `standalone.json` 這一列目前寫成 `pnpm ... accept -- --tags '...'`,
> 那個 `--` 在 pnpm 11.9.0 下會被原樣傳給 `cucumber-js`,cucumber 11 接著把 tag 運算式
> 當成檔案路徑開啟而失敗(12 個 key 全部一樣,不只本資料夾)。已列在「待協調」。

## 依賴

**phase-1(回填)**:只依賴 `apps/api` 既有碼(`server.ts`、`correlation.ts`、`health/checks.ts`)
與 `services/identity` 的示範帳號 seeding。不依賴其他能力資料夾的 steps。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(文件狀態事件進稽核) | I4、`05-ingestion` phase-3、**使用者核可建立 `services/audit/`** | 新資料夾是使用者級授權(CLAUDE.md 決策權表) |
| phase-3(`services/audit` 從 0 行到可查) | I6 通過、稽核事件 schema 的契約 | 契約裡目前沒有任何稽核內容;新 schema 是使用者級 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `apps/api/src`(本 phase 一行實作都沒改) |
| 測試 | 既有 vitest(`server.test.ts`、`health/admin-health.test.ts`、`health/checks.test.ts`)+ cucumber `phase-1.feature` 9 場景 | |
| 級別 | **嚴格** | 觸及稽核與資料可見性;失敗模式靜默(角色清單放寬後沒有東西會報錯,詳細報告就這樣給了每一個人) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)health 兩條路由、trace id 串接、log 衛生、詳細報告的角色守門 | I1 | in-progress | |
| 2 | 文件狀態事件進稽核 | I4 | todo | |
| 3 | `services/audit` 從 0 行到可查可匯出 | I7 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability answers an operator before anybody has signed in | `apps/api/src/server.test.ts`: 「returns 200 with status, version and uptimeMs」、「needs no session — it is an operations endpoint」 |
| The public summary tells an anonymous caller nothing about the machine behind it | `apps/api/src/server.test.ts`: 「leaks neither filesystem paths nor environment values」 |
| A subsystem falling over shows up as degraded while the endpoint operators poll stays reachable | `apps/api/src/server.test.ts`: 「AC1's own literal example: status degraded when the database connection is closed」、「stays 2xx even when degraded」 |
| One action can be followed through the log by the trace id its caller chose | `apps/api/src/server.test.ts`: 「reuses a supplied x-correlation-id」、「puts the supplied id on that request's log lines」 |
| A trace id shaped to forge a log line is thrown away instead of written down | **沒有 vitest 對應**——守門是 `apps/api/src/correlation.ts` 的 `SAFE_CORRELATION_ID`,入口與上一列同一個(`buildServer()` + `inject()`)。這是它第一次有機器證據,見「開放問題」 |
| Signing in with a password never leaves the password, the cookie or the bearer token in the log | `apps/api/src/server.test.ts`: 「logs neither cookie, nor authorization header, nor request body」(該測試打 `__test__/widgets`,那條路由只在 fixture 契約下存在;本場景改打真實的 `/v1/auth/login`,祕密從假的 body 值換成真的密碼) |
| Nobody reads the detailed report without signing in first | `apps/api/src/health/admin-health.test.ts`: 「401s with no session at all」 |
| Someone signed in without an operator role is refused the detailed report | `apps/api/src/health/admin-health.test.ts`: 「403s for demo-user (general_user, not in x-required-roles), and does not leak the required-roles list」 |
| An IT administrator is shown every subsystem by name | `apps/api/src/health/admin-health.test.ts`: 「200s with all 4 subsystems for demo-it」 |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@audit-observability and @phase-1 and not @manual and not @e2e'`
  → `9 scenarios (9 passed)`。
- 反向驗證(2026-09-04,手動;`tools/mutate.mjs` 只驅動 vitest,本層是 cucumber):
  把 `apps/api/src/server.ts:90` 的 `ADMIN_HEALTH_ROLES` 加一個 `"general_user"`
  ——一個放寬角色清單的真實筆誤,壞掉時**沒有任何東西會報錯**。
  「Someone signed in without an operator role is refused the detailed report」紅在
  `詳細健康報告洩漏給了沒有操作者角色的人——回應裡出現子系統 api:{"checkedAt":…,"subsystems":[…]}`。
  第一條炸的是**內容**斷言(子系統清單洩漏),不是狀態碼,也不是「有沒有拋錯」。
  還原後 `sha256` 與突變前相同、9/9 回綠。四段輸出在 commit body。
- `@manual`:無。

## 待協調(要協調者改共用檔的)

- ~~`standalone.json`(**12 個 key 全部**):`pnpm --filter @ai-km/features accept -- --tags '…'`
  在 pnpm 11.9.0 下會把 `--` 原樣傳給 cucumber-js,cucumber 11 接著把 tag 運算式當成路徑
  `features/@retrieval and @standalone and not @manual` 開啟,`ENOENT` 退出 1。
  實測:帶 `--` 失敗、拿掉 `--` 的同一條指令 `9 scenarios (9 passed)`。
  建議措辭:把每一列的 `accept -- --tags` 改成 `accept --tags`。
  影響面:`/phase-done` 會實際跑 `standalone.json`,現況下**每個資料夾都會假紅**;
  `_world.ts` 的 `runStandalone()` 同理(本資料夾沒有場景用到它)。~~
  **已修好(`a0e8d80`)**:`standalone.json` 的 `--` 已拿掉。
- `features/steps/common.steps.ts`:無新增需求(本資料夾用了 `a {string} request is sent to
  {string}`、`the response status is {int}`,都已存在)。

## 開放問題

- **`services/audit/` 不存在**。2026-09-04 實際 `ls services/` 只有 `conversation`、`feedback`、
  `generation`、`identity`、`ingestion`、`model-gateway`、`retrieval` 七個。`docs/01-roadmap.md`
  寫的「`services/audit` 0 行」措辭不準——審核者查證:該目錄是在 `7691ca6`(文件整理)時
  **連目錄一起刪掉**,不是「存在但是空的 0 行」,正確說法是**目錄不存在**。本 phase
  **沒有**新建它(新資料夾是使用者級授權)。roadmap 那一列的措辭要不要改,留給協調者。
- **`GET /v1/health` 沒有登記進任何契約**(E04-S078 抓到的偏離,`tools/contract-equivalence`
  會印 ABSENT)。場景照現況寫,**沒有**補契約(改契約 = 使用者級)。這也表示本資料夾
  phase-1 的主力端點目前不受 L2-EQ 保護。
- 「A trace id shaped to forge a log line is thrown away」這一條在 vitest 層沒有對應測試,
  是本次回填第一次替 `SAFE_CORRELATION_ID` 建立機器證據。判斷理由:入口與其他 correlation
  場景完全相同(`buildServer()` + `inject()`),行為在**未改一行實作**的情況下就是綠的,
  所以它是「這個能力現在已經會做的事」,不是新需求。若審核者認為回填只能覆蓋已有 vitest 的
  行為,拿掉這一條即可,其餘 8 條不受影響。
- 本資料夾在 `docs/architecture/story-to-capability-map.md` 裡**一列 story 都沒有**。
  素材全部來自被歸給別的資料夾的平台 story。這不是遺漏,是「稽核這個能力還沒被做過」的
  誠實形狀——I7 才是它真正落地的地方。
- **審核者補充的兩條觀察**(2026-09-04):
  - log 衛生那條場景(「Signing in with a password never leaves the password, the cookie or
    the bearer token in the log」)測的是 `apps/api/src/server.ts:157` 的 `redact` 與
    `:166` 的 `serializers.req` **兩層的合取**,不是單一守門。審核者實測:只放寬
    `serializers.req` 時該場景**仍綠**,是 `redact` 那一層接住了洩漏。這是好的縱深防禦,
    但單層破壞抓不到,值得記明——要不要拆成兩條分別打各自的突變,留給 owner 判斷。
  - 「A trace id shaped to forge a log line is thrown away」這條場景守的**不只是**
    `SAFE_CORRELATION_ID` 本身:放寬 `serializers.req` 也會讓原始 `x-correlation-id`
    header 進 log,這條場景因此**同樣會紅**——它比本檔「回填對照表」宣稱的價值更高
    (不只是第一次替 `SAFE_CORRELATION_ID` 建立機器證據,也是 `serializers.req` 這一層的
    另一個守門入口),更不該被拿掉或簡化。
