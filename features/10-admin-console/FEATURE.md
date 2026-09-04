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
- **系統健康**:四個子系統的名稱與狀態值域(`apps/api/src/health/checks.ts` 的實際量測)

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
| 1 | (回填)誰看得到 admin、頁面授權表、部門／群組／連接器清單、系統健康 | I1 | todo | |
| 2 | 頁面層(元件渲染、route guard 實際擋人)、導覽與授權表對齊 | I6 | todo | |
| 3 | 部門／群組接真後端 | I6 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The console's privileged reads answer on a server built from nothing else | `apps/api/src/health/admin-health.test.ts`: 「200s with all 4 subsystems for demo-it」 |
| The highest administrator passes a gate that never names their role | `apps/api/src/health/admin-health.test.ts`: 「200s for demo-super (super_administrator implicitly passes every requireAnyRole gate, E02-S033)」 |
| A signed-in general user is turned away and learns nothing about the system | `apps/api/src/health/admin-health.test.ts`: 「403s for demo-user … and does not leak the required-roles list」 |
| Someone who never signed in is turned away before any subsystem is read | `apps/api/src/health/admin-health.test.ts`: 「401s with no session at all」 |
| Each console page admits exactly the roles published for it(5 例) | `apps/admin/src/lib/admin-route-access.test.ts`: 「requires it_administrator or super_administrator for /users…」、「resolves a nested route (/users/[id]) to the same requirement as its parent /users」、「requires super_administrator only for /roles…」(同一函式、同一形狀) |
| A path that merely looks like a console page inherits nobody's permission | `apps/admin/src/lib/admin-route-access.test.ts`: 「does not match an unrelated sibling route by prefix (/document-failures vs /document-failures-report)」 |
| The console's department list is the four departments the organisation already uses | `apps/admin/src/lib/departments.test.ts`: `listDepartments` 的種子清單 |
| The console's group list is the three groups people are already assigned to | `apps/admin/src/lib/groups.test.ts`: `listGroups` 的種子清單 |
| A department added without a name is refused instead of being stored nameless | `apps/admin/src/lib/departments.test.ts`: `createDepartment` 空白名稱 → `VALIDATION_ERROR` |
| Every connector starts switched off, because none of them has ever been connected | `apps/admin/src/lib/connectors.test.ts`: `listConnectors` 九個連接器、初始 `disabled` |
| An administrator walks the four management pages in a browser(`@e2e @manual`) | 無自動綁定——瀏覽器層,由人確認;步驟刻意不定義(與 `docs/integration/i1-*.feature` 的 `@manual` 場景同一慣例) |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@admin-console and @phase-1 and not @manual and not @e2e'`
  → `14 scenarios (14 passed)`。
- **反向驗證(2026-09-04,嚴格級必做)**:把 `services/identity/src/require-session.ts:245`
  的 `if (roles.some((role) => auth.roles.includes(role))) return;` 改成
  `… || true) return;`(即角色交集檢查永遠成立)。
  只有「A signed-in general user is turned away and learns nothing about the system」變紅,
  紅在第一條決定性斷言:

  > `AssertionError [ERR_ASSERTION]: 「demo-user」不得看到任何子系統讀數,但 HTTP 200 洩漏了 4 筆:api=ok, database=ok, migrations=ok, asr=down|整個回應:{"checkedAt":…,"subsystems":[…]}`

  斷言對著的是**洩漏出來的內容與身分**(誰、看到了哪四筆讀數),不是狀態碼、不是筆數存在性。
  還原後 `sha256` 與突變前逐位元相同(`e5d5f4dd…4d3528`),14/14 回綠。
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
- `AdminRouteGuard` 的元件層(真的擋住渲染)在 phase-1 沒有覆蓋:那 53 個 `*.test.tsx` 走 jsdom,
  cucumber runner 是純 node。授權表本身(guard 讀的那份資料)已經被 5+1 個場景釘住。
- `asr` 子系統在沒有 ASR 服務的機器上會量到 `down / fetch failed`。場景刻意只斷言
  **狀態值落在 admin console 顯示得出來的四個值域裡**,不釘特定子系統的狀態——釘了會變成
  對執行環境的斷言,而不是對這個能力的斷言。
