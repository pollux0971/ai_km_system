# 02 · authorization

## 一句話

一個人能看到什麼,在任何儲存體被碰到之前就已經決定好了:一個身分加上一組明列的部門鑰匙,
沒列到的一律看不到,而「忘了把授權接進來」會當場炸掉,不會被當成「這個人什麼都看不到」。

## owner

待指派(phase-1 回填由測試 agent 完成,2026-09-04)。

## 範圍

- `RetrievalScope` 這個值本身怎麼被建構:branded 型別 + fail-closed 建構子 `toRetrievalScope()`
- 「空授權」與「沒有授權」的差別:空 `allowedScopeKeys` 合法(意義是拒絕全部),
  缺 principal / 缺陣列則拒絕(代表呼叫端沒把授權接進來,不得靜默視為 deny-all)
- Deny-Wins 在**建構**這一層:未列出的鑰匙拒絕、沒有標記的資料拒絕(沒標記 ≠ 公開)
- 授權轉成資料庫過濾條件 `buildScopeSql()`:零授權產生 `1 = 0`,永遠不產生空的 `IN ()`
- 最後一道防線 `assertNoScopeLeak()`:越界時**拋錯並指名越界的部門**,不靜默過濾
- 身分這一側今天給得出什麼:真實登入後的 session 帶部門與群組,且**不帶任何現成的 scope 鑰匙**

## 不在範圍

- 用 scope 去過濾向量庫、洩漏偵測在檢索路徑上的行為(→ `06-retrieval`,已回填完成)
- 從身分推導 `RetrievalScope`(E04-S009,仍 blocked;phase-2 的 gate)
- 部門／群組的管理介面與變更即時生效(→ `10-admin-console` 與本資料夾 phase-3,I6)
- 角色型 route 守門(`requireAnyRole`)在各 admin 路由上的 403/401 行為
  (→ 那些路由所屬的資料夾:`09-feedback-analytics`、`12-audit-observability`)
- 登入、session cookie、CSRF(→ `01-identity`)

## 來源

- 契約:`contracts/openapi/auth.yaml`(`AuthSession` 的 `department` / `group` 欄位)。
  `RetrievalScope` 沒有 HTTP 契約,它是 in-process 接縫(ADR 0007)。
- 舊 story(素材,不是規格):E04-S009(blocked)、E04-S062(禁止過渡對應表)、
  E02-S032/S033(身分與最小 RBAC 切片)
- 實作:`services/retrieval/src/authorization/scope.ts`、`packages/permissions/src/index.ts`(僅型別)、
  `services/identity/src/`(登入與 session)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept -- --tags '@authorization and @standalone and not @manual'
```

預期輸出:`9 scenarios (9 passed)`。八個場景是純函式(不需要 DB、模型、port);
第九個(身分那條)起一個真實 `buildServer()`,用記憶體 SQLite 與真實 migration,一樣不開 port。

## 依賴

**phase-1(回填)**:只依賴 `services/retrieval/src/authorization/` 與 `services/identity/`
既有的碼,不改任何實作。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(從身分產出 `RetrievalScope`) | E04-S009 解除 blocked(使用者級裁定:部門／群組 → scopeKey 的對應規則) | 今天 session 給的是部門**顯示名稱**(「資訊部」),不是 store 用的鑰匙(`dept:*`);兩者之間的對應是產品決策,沒有人裁定過 |
| phase-3(群組變更即時生效) | phase-2 done、I6 的 admin 部門／群組頁 | 對應規則存在之後才談得上「改了立刻生效」 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/retrieval/src/authorization/`、`services/identity/src/` |
| 測試 | vitest(`scope.test.ts` 8 條、`plugin.test.ts`)+ cucumber `phase-1.feature` 9 個場景 | |
| 級別 | **嚴格** | 定義上就是授權:RBAC／授權範圍／資料可見性;失敗模式是靜默(算太寬 = 看到別人的資料,算太窄 = 使用者只看到「查無資料」) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)scope 的建構、Deny-Wins、空授權 vs 缺授權、SQL 過濾、洩漏拋錯、身分今天給得出什麼 | I1 | done | 2026-09-04 |
| 2 | 從 identity 的 session 產出 `RetrievalScope` | I3 | blocked | |
| 3 | 群組 → scopeKeys 的對應與變更即時生效 | I6 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own | `services/retrieval/src/authorization/scope.test.ts`: PF0 未列出的範圍一律拒絕 |
| A caller who brings no principal is a bug, not a person who may read nothing | `scope.test.ts`: PF0 空的 principalId 必須拒絕——代表授權沒被接進來 |
| A person with no grants yet is a real person who may read nothing | `scope.test.ts`: PF0 空的 allowedScopeKeys 是合法狀態,意義為拒絕全部 |
| A record carrying no department label is refused rather than treated as public | `scope.test.ts`: PF0 缺少 scopeKey 的資料一律拒絕,而非視為公開 |
| Grants become a database filter that can only narrow, never widen | `scope.test.ts`: PF0 零授權時產生 1 = 0,不得產生空的 IN ();PF0 SQL 使用參數佔位,不做字串拼接 |
| The last line of defence names the department that leaked instead of dropping it quietly | `scope.test.ts`: PF0 洩漏偵測拋錯而非靜默過濾——靜默過濾會留下真正的缺陷 |
| When nothing is out of scope the check hands back the very same records | `scope.test.ts`: PF0 全部合規時原樣回傳 |
| A signed-in identity already names a department, and hands over no ready-made scope keys | `services/identity/src/plugin.test.ts`: 200s with the demo account's fields, field-for-field, and never a token;200s for a valid cookie and advances last_seen_at(登入取 cookie 的路徑同 `apps/api/src/health/admin-health.test.ts` 的 `loginAs`) |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept -- --tags '@authorization and @phase-1 and not @manual and not @e2e'` → 9/9。
- 反向驗證(2026-09-04,回填時做,手動——`tools/mutate.mjs` 只驅動 vitest,這一層是 cucumber):
  `services/retrieval/src/authorization/scope.ts` 的 `buildScopePredicate` 把最後一行
  `return allowed.has(record.scopeKey);` 改成 `return true;` → 3 個場景紅,第一條炸的是
  「The capability runs on its own」的
  `授權範圍 [dept:maintenance] 不含「dept:finance」,卻接受了標記為「dept:finance」的資料——Deny-Wins 失效`。
  還原後 sha256 逐位元相同、9/9 綠。證據四段在 commit body。
- `@manual`:無。

## 開放問題

- **`RetrievalScope` 的 `allowedScopeKeys` 是 `Object.freeze` 過的,但沒有任何既有測試斷言
  「建好之後不能再加鑰匙」**。這是真實行為,不是猜的,但依「綁不到既有測試入口就不進 phase-1」
  的規則沒有寫進場景。要不要補一條 vitest(測試 agent 的工作)再回填成場景,待協調者決定。
- `packages/permissions/` 目前只有 `Role` 型別與 `AuthorizationDecision` 形狀,**沒有任何決策邏輯**
  (檔頭自述 policy engine 屬 Team B / E02)。因此本資料夾 phase-1 沒有任何場景綁到它。
  `AuthorizationDecision` 至今沒有任何生產者,是死型別還是 phase-2 的預留,需要 domain owner 一句話。
- 角色型守門 `requireAnyRole`(`services/identity/src/require-session.ts`)是今天唯一真的跑在
  request 路徑上的授權判斷,但它每一個真實消費者(`/v1/admin/health`、feedback 的 admin 路由)
  都落在別的能力資料夾。本資料夾刻意不回填它,以免與 `09` / `12` 撞場景;
  若協調者認為「授權判斷」該歸這裡,那是一次 `/feature` 分流,不是回填。

## 待協調

- 無需要協調者修改共用檔的事項。(本資料夾只新增自己的三個檔與
  `features/steps/authorization.steps.ts`,沒有動 `common.steps.ts`、`standalone.json`、
  `package.json`;`standalone.json` 的 `02-authorization` 條目已存在且指令正確,
  `expect` 是 `"scenarios ("`,不必改成硬編碼的 `9 scenarios`。)
