# 10 · admin-console

## 一句話

管理員登入後可以看見組織的部門、群組、連接器與各子系統的健康狀態,而沒有管理職權的人
連「系統長什麼樣子」都看不到——不是看到空畫面,是連一筆讀數都拿不到。

## owner

待指派(2026-09-04 由回填測試 agent 建立 phase-1)。

## 範圍

- **誰看得到 admin**:`/v1/admin/health` 的角色守門(`requireSession` → `requireAnyRole`),
  以及未授權時回應本體不得帶任何子系統讀數、不得列出可通過的角色清單
- **哪一頁誰能開**:`rolesRequiredForAdminRoute()` 的授權表(E11-S023/S026),
  含巢狀路徑沿用母頁面、未登記路徑 fail closed
- **部門管理**:列出、以空名稱新增被拒(`apps/admin/src/lib/departments.ts`)
- **群組管理**:列出(`apps/admin/src/lib/groups.ts`)
- **連接器管理**:列出、每一個的初始開關狀態(`apps/admin/src/lib/connectors.ts`)
- **系統健康**:四個子系統的名稱,以及在這個固定測試環境(throwaway、剛跑完 migration 的
  真實 SQLite + `AI_KM_ASR_PROVIDER=fake`)下每個子系統的實際量測值——`api`/`database`/
  `migrations` 三個是 `apps/api/src/health/checks.ts` 對真實子系統的量測,`asr` 是 fake
  provider 的確定性回應,不是對真實 ASR 服務的量測(2026-09-04 獨立審核退回修正:原文寫
  「狀態值域」,但場景實際只驗了「落在值域裡」而非量測到的值,兩者不是同一件事)

## 不在範圍

- 回饋佇列、使用量／延遲儀表板(→ `09-feedback-analytics`)
- 稽核紀錄頁與稽核事件(→ `12-audit-observability`)
- 知識庫頁面(→ `08-knowledge-management`)
- 導覽殼、跨視窗同步(→ `11-app-shell`)
- 登入本身、session、CSRF(→ `01-identity`;本資料夾只是它的消費者)
- 部門／群組落到真實後端(`contracts/` 目前沒有 department/group schema;
  `apps/admin` 的三個 store 是 approved story 明示的 in-app mock,phase-1 只驗它現在的行為)

## 來源

- 契約:`contracts/openapi/analytics.yaml` 的 `/admin/health`(含 `x-required-roles`)
- 舊 story(素材,不是規格):E04-S047(health checks + admin health route)、
  E02-S033(`requireAnyRole`)、E11-S009(部門)、E11-S010(群組)、E11-S014(連接器)、
  E11-S022 / E13-S021(健康儀表板接真 API)、E11-S023 / E11-S026(admin route authorization)
- 規格庫:`archive/AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md` §7(角色職責)、
  §24(E10 企業資料整合的連接器清單)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@admin-console and @standalone and not @manual and not @e2e'
```

預期輸出:`14 scenarios (14 passed)`。全部在 node 裡跑:一個 `buildServer()` 起的真實 API
(不開 port、每個場景一個丟棄式 SQLite、假 ASR/embedding provider),加上直接呼叫
`apps/admin` 自己的授權表與三個 in-app store。不需要瀏覽器、不需要 jsdom、不需要模型。

根目錄 `standalone.json` 的 `10-admin-console` 目前指向 `pnpm --filter @ai-km/admin dev`
(互動式,`interactive: true`),所以 `/phase-done` 的單獨執行檢查跳過它。上面這一行才是
真正跑得動的單獨執行指令——見「待協調」第 2 條。

## 依賴

**phase-1(回填)**:`apps/api`(`buildServer`、health checks、`/v1/admin/health`)、
`services/identity`(`requireSession`/`requireAnyRole` 與示範帳號 seeding)、
`apps/admin/src/lib`(授權表與三個 in-app store)。不依賴其他能力資料夾的 steps。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(頁面層:元件渲染、`AdminRouteGuard` 實際擋人) | features runner 有瀏覽器環境(jsdom 或 Playwright) | 53 個 `*.test.tsx` 走的是 jsdom,cucumber runner 目前是純 node |
| phase-2(導覽與授權表對齊) | 無外部 gate,但需要新的斷言(既有測試沒有這一條) | 「每個導覽項目都有授權表條目」是 E11-S026 歷史缺口的性質版守門 |
| phase-3(部門／群組接真後端) | 使用者裁決 + `contracts/` 新增 department/group schema | 契約放寬屬使用者層級(CLAUDE.md 決策權表) |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `apps/admin/src`、`apps/api/src/health`、`services/identity/src` |
| 測試 | vitest(`admin-health.test.ts`、`admin-route-access.test.ts`、`departments/groups/connectors.test.ts`)+ cucumber `phase-1.feature` 14 場景 | |
| 級別 | **嚴格** | 觸及 RBAC 與資料可見性;失敗模式靜默(守門放寬時沒有任何東西報錯,未授權者只是「多看到一些東西」) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)誰看得到 admin、頁面授權表、部門／群組／連接器清單、系統健康 | I1 | in-progress(自動證據全綠;`@e2e` 待使用者)| |

**phase-1 狀態細節(2026-09-04,獨立驗收 session)**:四項核心的**自動那半全部誠實做完且綠**
——14 場景全過(`--strict`,無 undefined/pending)、單獨執行 exit 0、`typecheck` 45/45、
`lint` 37/37、`pnpm test --filter @ai-km/admin` 53 檔 409 條全過;反向驗證由驗收者**自選了
FEATURE.md 三個既有突變點之外的第四個**——把 `apps/admin/src/lib/admin-route-access.ts` 的
`/users` 角色清單追加 `general_user`(模擬守門放寬),紅在**角色身分陣列本身**:

```
AssertionError: expected [ 'it_administrator', …(2) ] to deeply equal [ 'it_administrator', …(1) ]
+   "general_user",
```

還原前後 sha256 逐位元相同(`22188af7…1ebb235984e2cec`),重跑 8 tests passed。
斷言對著內容/身分,不是狀態碼或存在性,符合 §5.2。

**但 phase-1 不是 `done`**,而且缺的那一半不能用測試補:本資料夾是 12 個回填資料夾裡
**唯一**帶 `@e2e @manual` 場景的(01/02/03/04/06/09 都沒有),依 GHERKIN_WORKFLOW §5.4
「驗收不是測試」,它要的是使用者親眼看過。場景原文已抄進 `docs/DECISIONS_NEEDED.md`。
使用者確認後才改 `done`——不得用自動斷言冒充,也不得為了不冒充而抹掉上面驗過的東西。

**驗收者另外提出、需要協調者走 `/feature` 的一件事**:`phase-1.feature` 的 Scenario Outline
把 `/departments | super_administrator` 寫進 Examples,等於把 E11-S023 的**最嚴讀法**
(當時「角色描述沒有字面對應」下選的保守解)提前凍結成已驗收規格。ADR 0013 裁決表 #14 已定
「部門主管管自己部門群組於 I6 落地,在那之前維持最嚴讀法」——所以現況是對的,但那條 Examples
在 I6 時必須跟著改,不是永久規格。已記在本節,I6 走 `/feature`。

| 2 | 頁面層(元件渲染、route guard 實際擋人)、導覽與授權表對齊 | I6 | todo | |
| 3 | 部門／群組接真後端 | I6 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The console's privileged reads answer on a server built from nothing else | `apps/api/src/health/admin-health.test.ts`: 「200s with all 4 subsystems for demo-it」 |
| The highest administrator passes a gate that never names their role | `apps/api/src/health/admin-health.test.ts`: 「200s for demo-super (super_administrator implicitly passes every requireAnyRole gate, E02-S033)」 |
| A signed-in general user is turned away and learns nothing about the system | `apps/api/src/health/admin-health.test.ts`: 「403s for demo-user … and does not leak the required-roles list」 |
| Someone who never signed in is turned away before any subsystem is read | `apps/api/src/health/admin-health.test.ts`: 「401s with no session at all」 |
| Each console page admits exactly the roles published for it(5 例) | 只有 2 例是真正回填:`/users`、`/users/mock-user-it-admin` 綁 `apps/admin/src/lib/admin-route-access.test.ts` 的「requires it_administrator or super_administrator for /users…」與「resolves a nested route (/users/[id]) to the same requirement as its parent /users」。**`/connectors`、`/health` 這兩例沒有對應的既有測試,是新增斷言,不是回填**——只是呼叫同一個 `rolesRequiredForAdminRoute()` 函式、走既有測試已驗證過的同一種比對形狀(exact-match、非 prefix)。`/departments` 見下方「開放問題」的獨立處理(2026-09-04 獨立審核退回)。 |
| A path that merely looks like a console page inherits nobody's permission | `apps/admin/src/lib/admin-route-access.test.ts`: 「does not match an unrelated sibling route by prefix (/document-failures vs /document-failures-report)」 |
| The console's department list is the four departments the organisation already uses | `apps/admin/src/lib/departments.test.ts`: `listDepartments` 的種子清單 |
| The console's group list is the three groups people are already assigned to | `apps/admin/src/lib/groups.test.ts`: `listGroups` 的種子清單 |
| A department added without a name is refused instead of being stored nameless | `apps/admin/src/lib/departments.test.ts`: `createDepartment` 空白名稱 → `VALIDATION_ERROR` |
| Every connector starts switched off, because none of them has ever been connected | `apps/admin/src/lib/connectors.test.ts`: `listConnectors` 九個連接器、初始 `disabled` |
| An administrator walks the four management pages in a browser(`@e2e @manual`) | 無自動綁定——瀏覽器層,由人確認;步驟刻意不定義(與 `docs/integration/i1-*.feature` 的 `@manual` 場景同一慣例) |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@admin-console and @phase-1 and not @manual and not @e2e'`
  → `14 scenarios (14 passed)`。
- **反向驗證 A(2026-09-02 起既有,2026-09-04 因 asr 讀數改為確定性 `ok` 而重跑更新引文)**:
  把 `services/identity/src/require-session.ts:245` 的
  `if (roles.some((role) => auth.roles.includes(role))) return;` 改成
  `… || true) return;`(即角色交集檢查永遠成立)。
  只有「A signed-in general user is turned away and learns nothing about the system」變紅,
  紅在第一條決定性斷言:

  > `AssertionError [ERR_ASSERTION]: 「demo-user」不得看到任何子系統讀數,但 HTTP 200 洩漏了 4 筆:api=ok, database=ok, migrations=ok, asr=ok|整個回應:{"checkedAt":…,"subsystems":[…]}`

  斷言對著的是**洩漏出來的內容與身分**(誰、看到了哪四筆讀數),不是狀態碼、不是筆數存在性。
  還原用 `git show HEAD:services/identity/src/require-session.ts > <path>`,`sha256` 與突變前
  逐位元相同(`e5d5f4dd…4d3528`),14/14 回綠。
- **反向驗證 B(2026-09-04,獨立審核退回修正,必做)**:`checkAsr` 的值域斷言換成內容斷言後
  (見上方「範圍」與退回理由),重做審核者當初的突變——`apps/api/src/health/checks.ts` 的
  `checkAsr` 的 `asrProvider === "fake"` 分支硬改成無條件 `return { name: "asr", status: "ok" }`
  ——**結果與退回前不同:14/14 全過,一條都沒紅**。這不是沒做,是**這個突變在修好(1)之後
  變成沒有意義的突變**:場景現在本來就以 `AI_KM_ASR_PROVIDER: "fake"` 啟動 server,而
  `checkAsr` 的 fake 分支本來就是無條件回 `ok`(`checks.ts:102-104`)——把它硬改成同樣的
  無條件 `ok` 對輸出沒有任何影響,實測證實(不是用讀的推斷,GHERKIN_WORKFLOW §5.3)。
  於是改用**同一分支的鏡像突變**證明新斷言真的有咬合力:把該行的 `status: "ok"` 改成
  `status: "down"`(模擬 fake 路徑本身壞掉、健康檢查沉默地回報成錯的狀態),結果:

  > `AssertionError [ERR_ASSERTION]: 子系統狀態應為 {"api":"ok","database":"ok","migrations":"ok","asr":"ok"},實際 {"api":"ok","database":"ok","migrations":"ok","asr":"down"}(HTTP 200):{"checkedAt":…}`
  >
  > `+ actual - expected` diff 明確點出 `asr: 'down'` vs 期望 `asr: 'ok'`

  只有「The console's privileged reads answer on a server built from nothing else」變紅
  (1 failed, 13 passed)。斷言對著的是**四個子系統各自的實際狀態值**,不是值域成員資格。
  還原用 `git show HEAD:apps/api/src/health/checks.ts > <path>`,`sha256` 與突變前逐位元相同
  (`72575aed…d81d8f06e6c62fe`),14/14 回綠。
- **反向驗證 C(2026-09-04,自選,fail-closed 邊界)**:`apps/admin/src/lib/admin-route-access.ts:80`
  的 `pathname.startsWith(\`${route.href}/\`)` 改成裸的 `pathname.startsWith(route.href)`
  (拿掉尾端 `/` 前綴,讓「看起來像但其實不是」的路徑意外繼承母路徑權限)。因為 `ADMIN_ROUTES`
  第一筆是 `{ href: "/", roles: ADMIN_ROLES }`,裸 `startsWith` 下每個路徑都會先撞到 `/`,
  結果 **6 scenarios 變紅**(5 個 Examples 列 + 「A path that merely looks like a console
  page inherits nobody's permission」),例如:

  > `AssertionError [ERR_ASSERTION]: 「/document-failures-report」沒有登記在授權表裡,必須誰都不允許(fail closed),實際 ["it_administrator","ai_administrator","auditor","super_administrator"]`
  >
  > `AssertionError [ERR_ASSERTION]: 「/health」應只允許 it_administrator, super_administrator(含順序),實際 ["it_administrator","ai_administrator","auditor","super_administrator"]`

  斷言對著的是**哪些角色被誰放行**(身分清單與順序),不是狀態碼、不是「有沒有回傳東西」。
  還原用 `git show HEAD:apps/admin/src/lib/admin-route-access.ts > <path>`,`sha256` 與突變前
  逐位元相同(`22188af7…1ebb235984e2cec`),14/14 回綠。
  (三次突變的備份放這個 worktree 專屬的 `.mutate-tmp/`,完成後已刪除,不放 `/tmp` 共用目錄
  ——2026-09-04 技術顧問裁決:並行 session 的同名備份會互相蓋掉。)
- `@manual`:一條 `@e2e @manual` 的瀏覽器走查,待使用者親手確認;**在使用者確認之前不算通過**
  (GHERKIN_WORKFLOW §5.4:驗收不是測試)。

## 待協調(要協調者改共用檔)

1. **`features/tsconfig.json` 的 `lib` 加上 `"DOM"`。**
   為什麼:`apps/admin/src/lib/{departments,groups,connectors}.ts` 在 node 底下跑得動
   (`typeof window === "undefined"` 就回種子資料,已實測),但原始碼提到 `window`;
   features 的 `lib` 只有 `["ES2022"]`,靜態 import 會把那三個檔用錯的 lib 設定重新型別檢查一次,
   產生 4 個 `Cannot find name 'window'`(實測 `tsc -p features/tsconfig.json` 的原文輸出)。
   目前的作法是在 `features/steps/admin-console.steps.ts` 用算出來的 specifier 做動態 import,
   讓那三個檔不被拉進 features 的 TS program——它們本來就由 `apps/admin/tsconfig.json`
   (有 DOM)負責型別檢查,`pnpm typecheck` 會跑到。
   建議措辭:`"lib": ["ES2022", "DOM"]`。加了之後那段動態 import 可以直接換成普通 static import,
   場景與斷言一行都不用動。

2. **`standalone.json` 的 `10-admin-console` 建議改成可自動執行的那一條。**
   為什麼:目前是 `pnpm --filter @ai-km/admin dev`(`interactive: true`),`/phase-done` 會跳過,
   等於這個資料夾沒有單獨執行的機器證據。本資料夾的 14 個場景全部在 node 跑得動。
   建議措辭:
   ```json
   "10-admin-console": {
     "cmd": "pnpm --filter @ai-km/features accept --tags '@admin-console and @standalone and not @manual and not @e2e'",
     "interactive": false,
     "expect": "14 scenarios (14 passed)"
   }
   ```
   (瀏覽器走查改由 phase-1.feature 的 `@e2e @manual` 場景承載。)

3. **`standalone.json` 現有全部 cucumber 條目的 `-- --tags` 形式在 pnpm 11.9.0 下是壞的
   ——這不是本資料夾造成的,但會讓 `/phase-done` 的單獨執行檢查對每個資料夾都紅。**
   實測(本 worktree,`pnpm@11.9.0`,`packageManager` 欄位指定的同一版):
   ```
   $ pnpm --filter @ai-km/features accept -- --tags '@retrieval and @standalone and not @manual'
   $ NODE_OPTIONS=--import=tsx cucumber-js -- --tags '@retrieval and @standalone and not @manual'
   [Error: ENOENT: no such file or directory, open '…/features/@retrieval and @standalone and not @manual']
   Exit status 1
   ```
   pnpm 11 把 `--` 原樣轉給腳本,cucumber-js 11 把 `--` 之後的東西當成**路徑**。
   拿掉那個 `--` 就正常(`9 scenarios (9 passed)`)。
   建議措辭:把所有 cucumber 條目的 `accept -- --tags` 一律改成 `accept --tags`。

## 開放問題

- 部門與群組目前是 `apps/admin` 內的 in-app store(approved story 明示的 mock,
  `contracts/` 沒有對應 schema)。phase-1 只驗「它現在會做的事」,**不代表跨部門管理已經可用**。
  接真後端要先由使用者裁決契約放寬(CLAUDE.md 決策權表:新 schema 屬使用者層級)。
- 授權表對 `/roles`、`/permissions`、`/departments`、`/groups`、`/usage`、`/latency` 一律
  只給 `super_administrator`,是 E11-S023 在「角色描述沒有字面對應」時選的最嚴讀法,
  **不是最終政策**。真正的部門主管能不能管自己部門的群組,是 I6 之前要問使用者的產品行為。
  **2026-09-04 獨立審核指出的張力**:上面這句話把 `/departments → super_administrator`
  標成「暫定的最嚴讀法」,但 `phase-1.feature` 的 Scenario Outline 同時把
  `/departments \| super_administrator` 寫進 Examples 表,當作已驗收的規格斷言——等於
  把一個自承未定的政策升格成規格。`.feature` 依 GHERKIN_WORKFLOW §6 只有使用者或
  `/feature` 流程能改,回填 agent 不動它,這裡先把張力寫清楚,由協調者走 `/feature` 決定:
  - **選項 A(建議)**:把 `/departments` 這一列移出 Scenario Outline,只驗
    `/users`、`/connectors`、`/health` 三個已經是穩定政策(有字面角色對應)的頁面;
    `/departments` 的授權留給 phase-2/3 在部門主管政策拍板後再補場景。
    好處:phase-1 不再意外把一個「最嚴讀法,非終局」的暫定值凍結成規格。
  - **選項 B**:保留這一列,但在 `.feature` 該 Scenario Outline 上方加一行 comment
    (例如 `# /departments 目前是 E11-S023 的最嚴讀法,不是最終政策——見 FEATURE.md 開放問題`),
    讓規格檔本身承認這一格是暫定值,而不是靠 FEATURE.md 單方面聲明。
    好處:不縮小 phase-1 涵蓋範圍,現有 5 例都留著。
  兩個選項都不需要改判斷邏輯本身(`admin-route-access.ts` 不動),差別只在
  `/departments` 這一格算不算「已驗收的規格」。回填 agent 的建議是選項 A——
  「非最終政策」的東西不應該先進 Then 斷言,等政策定了再回填比較乾淨。
- `AdminRouteGuard` 的元件層(真的擋住渲染)在 phase-1 沒有覆蓋:那 53 個 `*.test.tsx` 走 jsdom,
  cucumber runner 是純 node。授權表本身(guard 讀的那份資料)已經被 5+1 個場景釘住。
- **(2026-09-04 獨立審核退回修正,已解決)** 原本 `startServer()` 沒有傳 `config`,所以
  `asr` 落到預設 `whisper-server` provider,對 `127.0.0.1:8178` 發真實 fetch——`asr` 在
  沒有服務的機器上是 `down`,在有服務的機器上是 `ok`,同一份測試在兩台機器上驗的東西不同,
  而且場景只斷言「狀態落在值域裡」,連 `checkAsr` 說謊(無條件回 `ok`)都測不出來(獨立審核
  實測:14/14 全過)。修法:`admin-console.steps.ts` 自己在 `startServer(extra)` 傳
  `config: loadConfig({ …, AI_KM_ASR_PROVIDER: "fake" })`(與 `admin-health.test.ts` 同一條
  路),讓 `asr` 變成確定性的 `ok`;「every subsystem reading carries a status …」這條斷言
  也從值域改成釘住四個子系統各自的實際狀態(`api=ok, database=ok, migrations=ok, asr=ok`)。
  反向驗證見 EVIDENCE / commit body。
