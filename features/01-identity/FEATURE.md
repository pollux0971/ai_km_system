# 01 · identity

## 一句話

一個人用帳號密碼換到一張只有瀏覽器帶得動的 session cookie,之後每一個請求都靠那張
cookie 決定「這是誰」;被拒絕的時候對方問不出多餘的東西,別的網站也偽造不了他的操作。

## owner

待指派(phase-1 回填由測試 agent 於 2026-09-04 完成;實作一行未改)。

## 範圍

- `POST /v1/auth/login`:驗密碼、發 HttpOnly / SameSite=Lax / Path=/ 的 `ai_km_session` cookie,
  HTTPS 時加 `Secure`;回應是 `auth.yaml` 的 `AuthSession`,**永遠不含 token 本身**
- 拒絕的形狀:錯密碼與不存在的帳號同一個 `INVALID_CREDENTIALS`(不可帳號枚舉);
  停用帳號只在**密碼正確**時才透露 `ACCOUNT_DISABLED`
- `GET /v1/auth/session`:cookie → 這個人是誰、有哪些 role、session 何時到期;
  竄改／過期／閒置過久／期間被停用一律 401 並清掉 cookie
- `POST /v1/auth/logout`:刪掉 session 資料列(不只是清瀏覽器那份),冪等
- `requireSession` 這個接縫本身的 **`fp()` 包裝與父實例可見性**(ADR 0007 §5)
- CSRF(E04-S048):所有會改狀態的方法要帶 `x-requested-with`,**在讀密碼之前**檢查;
  GET/HEAD/OPTIONS 永遠不檢查(紅線:`EventSource` 帶不了自訂標頭)
- sandbox seeder registry(E02-S032 AC7):`AI_KM_TEST_SANDBOX=true` 時每次登入一個新的
  `ownerKey`,並對那一個 ownerKey 跑一次 seeder;關掉時 `ownerKey` 就是使用者本人的 id

## 不在範圍

- 從身分推導部門／群組的 `RetrievalScope`(→ `02-authorization`,E04-S009 仍 blocked)
- 這個人看得到哪些文件、能做哪些動作的完整 `resource:action` 判斷(→ `02-authorization`)
- 登入頁面本身與登入後的導覽(→ `11-app-shell`)
- 使用者／部門／群組的管理介面(→ `10-admin-console`)

## 來源

- 契約:`contracts/openapi/auth.yaml`(E02-S031 凍結)
- 舊 story(素材,不是規格):E02-S031、E02-S032、E02-S033、E02-S034、E02-S035、
  E04-S039、E04-S048、E04-S052、E04-S086
- ADR:`docs/adr/`(0005 identity/session、0007 §5 `fp()` 與父實例可見性)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@identity and @standalone and not @manual'
```

預期輸出:`13 scenarios (13 passed)`。全部 in-process:記憶體 SQLite(跑的是 `db/migrations/`
的真實 migration)、真實 scrypt、`app.inject()`,不開 port、不需要模型、不需要外部服務。

⚠️ 根目錄 `standalone.json` 的 `01-identity` 目前多一個 `--`,在 pnpm 11.9.0 下是紅的
(**每一個資料夾都是**,含 06-retrieval)。實測與修法見本檔最後一節與「待協調」第 3 條;
`standalone.json` 是共用檔,本資料夾不動它。

## 依賴

**phase-1(回填)**:只依賴 `services/identity/src`、`db/migrations/*_identity.sql`、
`*_login_attempts.sql` 與 `contracts/openapi/auth.yaml`。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(身分帶出部門／群組,落到 `02-authorization`) | `02-authorization` phase-1 存在;E04-S009 解除 blocked | 目前 session 回得出 `department` 字串,但沒有人把它變成 `RetrievalScope`;那條線屬於 02,不屬於這裡 |
| phase-3(登入體驗:apps/web 的登入頁、錯誤訊息、逾時重登) | I2 通過、`11-app-shell` phase-2 | 要瀏覽器才驗得到的部分現在一條都沒寫(見「沒寫進 phase-1 的行為」) |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/identity/src`(19 個 src 檔) |
| 測試 | vitest 7 檔(2515 行)+ cucumber `phase-1.feature` 13 場景 + 手動反向驗證 | cucumber 層 `tools/mutate.mjs` 不適用(它只驅動 vitest,GHERKIN_WORKFLOW §5.2) |
| 級別 | **嚴格** | 觸及身分與稽核入口;CSRF 與 session 守門的失敗模式是靜默的——守門沒接上時系統一切正常,只是誰都能操作(PITFALLS 坑 2) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)登入、session cookie、登出、CSRF、sandbox seeder | I1 | done | 2026-09-04 |
| 2 | 身分帶出部門／群組,交給 `02-authorization` | I3 | todo | |
| 3 | 登入體驗(apps/web 登入頁、逾時重登)`@e2e` | I3 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability stands up on a bare server of its own | `plugin.test.ts`: "smoke: the plugin builds and answers requests using only its own devDependencies";AC9 那組自建 bare Fastify + `identityPlugin` 的用法;`testing/app.ts` 的組裝順序 |
| A signed-in person gets a cookie the page's own scripts cannot read | `plugin.test.ts`: "200s with the demo account's fields, field-for-field, and never a token";"sets an HttpOnly, SameSite=Lax, Path=/ cookie without Secure over plain HTTP" |
| A refused sign-in tells the caller only what they are entitled to know(4 例) | `plugin.test.ts`: "401s with INVALID_CREDENTIALS for a wrong password";"401s with the SAME code for an unknown username (no account enumeration)";"403s with ACCOUNT_DISABLED …";"401s (not 403) for the disabled account with a WRONG password";"does not set a session cookie on a failed login" |
| The session behind a cookie names the same person who signed in | `plugin.test.ts`: "200s for a valid cookie and advances last_seen_at";"the 200 body satisfies auth.yaml's AuthSession schema" |
| Signing out kills the session itself, not just the browser's copy | `plugin.test.ts`: "204s, deletes the session, and the same cookie then 401s" |
| A hand-edited session cookie is refused and wiped, never repaired | `plugin.test.ts`: "401s and clears the cookie for a tampered cookie value" |
| A sign-in without the browser-only header dies before the password is read | `plugin.test.ts`: "POST /v1/auth/login WITHOUT x-requested-with is 403 CSRF_HEADER_MISSING, even with the correct password";"does not set a session cookie when the CSRF check denies the login";"does not record a login_attempts row when denied for a missing CSRF header" |
| A forged sign-out cannot log the victim out | `plugin.test.ts`: "POST /v1/auth/logout WITHOUT x-requested-with is 403 CSRF_HEADER_MISSING, even with a valid session cookie";"a CSRF-denied logout does NOT delete the session — the victim stays logged in" |
| Sandbox mode gives every sign-in its own data owner and seeds exactly that owner | `plugin.test.ts`: "gives two logins of the same account two different sandbox ownerKeys";"calls each registered sandbox seeder once per login, with that login's ownerKey" |
| Without sandbox mode a person owns their real data and nothing is seeded | `plugin.test.ts`: "uses ownerKey === userId and never calls a seeder when the sandbox flag is off" |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept -- --tags '@identity and @phase-1 and not @manual and not @e2e'`
  → `13 scenarios (13 passed)`。
- 反向驗證(2026-09-04,手動;cucumber 層 `tools/mutate.mjs` 不適用):把
  `services/identity/src/csrf.ts` 最後一行的
  `return { allowed: headerValue(request.headers[CSRF_HEADER]) !== undefined };`
  改成 `return { allowed: true };`(整個檔恰好出現一次)→ 2 個場景紅,兩條炸掉的都是
  **決定性斷言**、都排在該場景第一條:
  - 「A sign-in without the browser-only header dies before the password is read」紅在
    `login_attempts 應為 0 筆(請求應在讀密碼之前就被擋下),實際 1 筆——CSRF 守門沒有先跑`
    ——證明的是**次序**(守門在憑證邏輯之前),不是「有沒有回 403」。
  - 「A forged sign-out cannot log the victim out」紅在
    `被拒絕的登出不該動到受害者的 session:應仍屬於 mock-user-1,實際 undefined(undefined = session 已被刪除,受害者被登出了)`
    ——證明的是**受害者的 session 還在**,不是狀態碼。
  還原後 `sha256sum` 逐位元相同(`bf22f575…67cf0`),重跑 `13 scenarios (13 passed)`。
  完整四段輸出在本 phase 的 commit body。
- `@manual`:無。

## 待協調(要協調者改共用檔)

1. ~~**`features/steps/common.steps.ts` 的 `When("the {string} plugin is registered on a bare server and the server becomes ready")`
   目前跑不起來**:pattern 有一個 `{string}`,但 handler 宣告的是
   `async function (this: KmWorld)`(0 個參數),cucumber 直接判紅:
   `function has 0 arguments, should have 1 (if synchronous or returning a promise) or 2 (if accepting a callback)`
   (2026-09-04 實測,不是從原始碼推的)。**任何資料夾用這一句都會紅。**
   建議改成 `async function (this: KmWorld, _pluginName: string)`(或把 pattern 的
   `{string}` 拿掉)。在那之前本資料夾照 06-retrieval 的做法自己定義了
   `When the identity plugin is registered on a bare server and that server becomes ready`,
   但仍把結果放進 `this.bag["registeredApp"]`,所以父實例可見性用的還是通用的
   `Then the {string} plugin is visible on the parent server instance`。
   共用步驟修好之後,本資料夾這一句可以刪掉換回通用的。~~
   **已修好(`f903291`)**:`common.steps.ts` 的通用步驟已補上 `_pluginName` 參數。
2. **`features/package.json` 缺 `@fastify/cookie`**:第一個場景要在裸 server 上重現
   `services/identity/src/testing/app.ts` 的組裝(cookie → db → identityPlugin),
   而 `@fastify/cookie` 只是 `@ai-km/service-identity` 的 devDependency。本資料夾用
   `createRequire(new URL("../../services/identity/src/plugin.ts", import.meta.url))`
   從 identity 套件自己的解析根載入,不改共用的 package.json。建議合併時把
   `"@fastify/cookie": "^11.0.2"` 加進 `features/package.json` 的 devDependencies,
   步驟檔即可改回一行 `import cookie from "@fastify/cookie"`。
3. ~~**`standalone.json` 每一條 `pnpm --filter @ai-km/features accept -- --tags …` 在
   pnpm 11.9.0 下都是紅的**(含 `06-retrieval` 那條;實測輸出見本檔最後一節)。
   建議把 12 條裡的 `--` 一律拿掉。`/phase-done` 會真的跑這些指令,所以這條會擋到
   每一個資料夾的驗收,不只本資料夾。~~
   **已修好(`a0e8d80`)**:`standalone.json` 的 `--` 已拿掉。

## 沒寫進 phase-1 的行為(綁得到既有測試,但這個 phase 塞不下 / 需要別的環境)

「一個 phase 少於 3 或多於 15 個場景都要懷疑」——13 個已接近上限,下列全部**仍由
`services/identity` 的 vitest 守著**(沒有失去覆蓋),排進 phase-2 的 Gherkin:

- **守門的身分輸出**(session 竄改 / 過期 / 停用 → 401):phase-1 的「A hand-edited
  session cookie is refused and wiped」等場景斷言的 401,審核者實測是 `GET /v1/auth/session`
  handler 自己又查了一次 DB、在 `!row` 時回 401 的 **defence-in-depth** 在滿足,不是
  `requireSession` 這個接縫本身守住的——把 `buildRealRequireSession` 改成「偽造 cookie 也放行」,
  phase-1 13 條仍全綠;再把每個請求的 `request.auth` 換成 `"attacker"`,也是 13/13 全綠。
  這個行為**仍有測試守著**:`require-session.test.ts` + `plugin.test.ts` AC9 在同一個突變下
  **會紅**(審核者實測),只是 phase-1 的 `.feature` 沒有釘住它,repo 整體並非沒有守門。
- **`composeRequireSession` 的 fallback 分支**(疊在 `apps/api` 既有的 E04-S039 decorator
  之前而不是取代它):phase-1 沒有任何場景涵蓋這條路徑。
- 登入節流與帳號鎖定(E02-S034,`plugin.test.ts` 17 條):鎖定後的回應與一般錯密碼
  **逐位元相同**、per-IP 與 per-username 兩把鎖、視窗滑出後恢復、`LOGIN_RATE_LIMITED`
  telemetry 只記 hash 不記原文。這是嚴格級的重點題,值得自己一個 phase。
- session 生命週期的時間軸:絕對 TTL(7 天)、閒置上限(12 小時)、`last_seen_at` 前滑、
  期間被停用 → 401(`require-session.test.ts`)。要能操控時間,場景寫法要先想清楚。
- `Secure` cookie 與 `AI_KM_SESSION_COOKIE_DOMAIN`(E02-S033):HTTPS 判定、登出的清除
  cookie 必須帶同一個 `Domain`(否則瀏覽器根本不會刪)。
- `requireAnyRole` 的 RBAC 薄切片(E02-S033 AC2):`auditor` 過、`general_user` 403、
  `super_administrator` 一律過。**放這裡還是放 `02-authorization` 需要先分流**(見開放問題)。
- 契約驗證(`testing/contract.ts` 對 `auth.yaml` 的 5 條):回填成場景會變成
  「Then 回應符合 auth.yaml」這種實作語言的步驟,先留在 vitest。
- multipart 上傳的 CSRF 例外(Origin/Referer allowlist,`csrf.test.ts`):它的入口在
  `/transcriptions`,那條路由不屬於 identity,適合放 `04-model-gateway` 或整合點。
- `apps/api` 組裝後的整體 CSRF 迴歸(`apps/api/src/csrf/**`)與 `x-test-user` 假身分
  後備路徑:要真的 `buildServer()`,屬 phase-2(接進 composition root)。

## 開放問題

- **`requireAnyRole` 該歸誰**:它在 `services/identity` 裡,但做的是授權判斷。
  `02-authorization` 的 phase-1 同時在寫,兩邊都可能宣稱它。建議在兩個資料夾都 done
  之後用 `/feature` 分流一次,不要各寫各的。
- **反向驗證只證了 CSRF 這一層**:session 本身的守門(竄改 / 過期 / 停用 → 401)這次
  是**審核者量到的事實,不是「沒做過」**——把 `buildRealRequireSession` 改成「偽造 cookie
  也放行」,phase-1 13 條**仍全綠**;把每個請求的 `request.auth` 換成 `"attacker"`,
  也是 13/13 全綠(見「沒寫進 phase-1 的行為」的說明)。同一個突變下,`services/identity`
  的 vitest 有 2 條紅(`require-session.test.ts` + `plugin.test.ts` AC9),所以 repo 整體
  有守,只是 phase-1 的 `.feature` 沒釘住。下一次(或 phase-2)用窄突變打
  `buildRealRequireSession` 的 `if (!row)` 那一段,把這件事收進 cucumber 層自己的斷言。
- **首個場景的可見性斷言看的是 `requireSession`**:identityPlugin decorate 出來的就是
  這一個屬性,所以通用步驟的字串是 `"requireSession"` 而不是 `"identity"`。讀起來有點怪,
  但它斷言的正是 ADR 0007 §5 要的那件事(`fp()` 沒包 → 父實例上看不到)。若協調者要統一
  措辭,那是 `common.steps.ts` 的事。

## 補記(2026-09-04 實測,不是推論)

`standalone.json` 的 `01-identity`(以及 `02`~`07`、`09`、`12` 每一條同形狀的指令)
在 **pnpm 11.9.0** 下跑不起來:

```
$ pnpm --filter @ai-km/features accept -- --tags '@identity and @standalone and not @manual'
[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] … cucumber-js -- --tags '…'
path: '…/features/@identity and @phase-1 and not @manual and not @e2e'
```

pnpm 11 會把 `--` 一起轉給腳本,cucumber 11 於是把 tag 運算式當成一個**路徑**去 open。
`06-retrieval` 那一條(FEATURE.md 與 standalone.json 都是同一個形狀)實測同樣紅,
所以這不是本資料夾造成的。**拿掉那個 `--` 就會過**:

```
$ pnpm --filter @ai-km/features accept --tags '@identity and @standalone and not @manual'
13 scenarios (13 passed)
```

`standalone.json` 是共用檔(協調者所有),所以本資料夾不動它——列進「待協調」第 3 條。
