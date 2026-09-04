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
  (`@design-constraint` 場景,見下方「設計約束場景」段)

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
| 測試 | vitest(`scope.test.ts` 8 條、`deny.test.ts` 4 條——phase-2b,4/4 綠、`plugin.test.ts`)+ cucumber `phase-1.feature` 9 個場景、`phase-2.feature` 8 個場景(4 紅——2a 的 identity 轉換,blocked-team-a 待 01-identity 補 id;4 綠——phase-2b 的 deny) | |
| 級別 | **嚴格** | 定義上就是授權:RBAC／授權範圍／資料可見性;失敗模式是靜默(算太寬 = 看到別人的資料,算太窄 = 使用者只看到「查無資料」) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)scope 的建構、Deny-Wins、空授權 vs 缺授權、SQL 過濾、洩漏拋錯、身分今天給得出什麼 | I1 | done | 2026-09-04 |
| 2 | 從 identity 的 session 產出 `RetrievalScope` | I3 | blocked(見下) | |
| 3 | 群組 → scopeKeys 的對應與變更即時生效 | I6 | todo | |

**phase-2 狀態細節(2026-09-04,含 phase-2b 完成)**:契約 gate(E04-S009)已由技術顧問
依 ADR 0012 裁定解除——見下方「phase-2 提案(紅,2026-09-04)」與「phase-2b 提案
(deny,2026-09-04)」。裁定 4(顯式 deny)當時只定了「要蓋過 allow」這個方向,型別
形狀留白;技術顧問同日再裁定了完整形狀(`deniedScopeKeys`、謂詞與 SQL 的合成規則、
deny 來源留到 phase-3)。三輪接力做完 phase-2b:第一輪(測試 agent)把原本一條 deny
場景拆成四條(2 紅 2 綠,denied 清單刻意留在區域變數裡);第二輪(開發 agent)把
`scope.ts` 實作出來(`deniedScopeKeys` 輸出必填、輸入 optional——理由見 `scope.ts`
注解;predicate/SQL/`assertNoScopeLeak` 都認得它);第三輪(測試 agent,同日)把
denied 清單真的接進 `toRetrievalScope()`,並把兩條原本描述缺口的場景改寫成描述行為,
四條全綠(`pnpm turbo run test` 40/40)。IDENTITY 轉換那 4 條(Scenario Outline,
`dept:it`/`group:general`/`dept:maintenance`/`group:maintenance-eng`)不屬於 phase-2b,
仍是紅——2a(從身分推導 scopeKey)還沒做,見下方「發現:ADR 0012 裁定 1 假設的資料
今天不存在」。整合 gate(I2,`06-retrieval` phase-2 把 `retrievalPlugin` 接進
`apps/api` composition root)**仍是 todo**,所以本 phase 整體仍標 blocked。
`phase-2.feature`(8 個場景,4 紅 4 綠)+ steps 等協調者送技術顧問確認、merge,並等
I2、2a 完成後才能進 IMPLEMENT 收尾。

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
| A signed-in identity already names a department, and hands over no ready-made scope keys | `services/identity/src/plugin.test.ts`: "200s with the demo account's fields, field-for-field, and never a token"(`:148`,測的是 **`POST /v1/auth/login`** 的 body,裡面逐欄位斷言了 `department: "資訊部"` / `group: "一般使用者群組"`);"200s for a valid cookie and advances last_seen_at"(`:462`,測的是 **`GET /v1/auth/session`**,但只斷言 `userId`)。**場景走的是 session 路徑,不是 login 路徑**——「session 回應帶部門與群組」這個具體斷言,既有 vitest 沒有逐欄位測過;逐欄位的證據來自 login 那條,不是這條。(登入取 cookie 的路徑同 `apps/api/src/health/admin-health.test.ts` 的 `loginAs`) |

## 設計約束場景(`@design-constraint`)

`phase-1.feature` 的最後一個場景
`A signed-in identity already names a department, and hands over no ready-made scope keys`
帶 **`@design-constraint`** tag。它不只是描述現況,它是一道守門:

- **它紅的意思是**「有人把 scope 形狀的欄位塞進了 `GET /v1/auth/session` 的回應」——
  也就是有人在**沒有裁定**的情況下,抄捷徑從身分推導授權。那個裁定是 **E04-S009**;
  它禁止的那條捷徑(部門顯示名稱 → scopeKey 的過渡對應表)是 **E04-S062**。
- **看到它紅該做的是** `/feature` + ADR,**不是拿掉這條斷言**。
- **E04-S009 正式落地時**(phase-2),這個場景由 `/feature` 流程**改寫**成新的事實,
  **不得直接刪除**。描述現況的規格有它的生命週期,走完生命週期被改寫,
  跟「守門被靜默放寬」是兩回事——這是技術顧問 ai-km-3a 2026-09-04 的裁決
  (它不屬於 `docs/PITFALLS.md` 坑 1:那條講的是**工具裡的數字門檻**在正常成長時假紅)。

同一段說明以註解形式寫在 `phase-1.feature` 該場景正上方,`NEXT.md` 的「不可以先做的」
也指向這裡——從任何一份檔進來都找得到。

**這個場景會怎麼被改寫(2026-09-04,測試 agent 的提案,尚未執行)**:phase-2 真的落地
(有人實作了從身分推導 scope 的函式,通過審核)時,這個場景**不會被刪除**,而是改寫成
斷言一件更窄但仍然成立的事——即使推導函式存在,`GET /v1/auth/session` 的回應**仍然**
不該帶任何 `scope` / `scopeKeys` / `allowedScopeKeys` 形狀的欄位,因為推導本來就該留在
server 內部(retrieval/authorization 層),不透過 HTTP 交給呼叫端,呼叫端拿到手上等於
可以偽造(違反鐵律 #2 的 fail-closed 精神)。換句話說,場景的**斷言本體不變**(仍是
「session 回應裡沒有像 scope 的欄位」),改的是**場景說明文字與 Feature 文件的敘事**——
從「這是因為 E04-S009 還沒裁定」變成「這是刻意的架構決定,推導永遠留在 in-process」。
這個計畫寫在 `phase-2.feature` 開頭的註解裡,`phase-1.feature` 本身沒有被動過。

## phase-2 提案(紅,2026-09-04,branch `pollux0971/authz-phase2`)

測試 agent 依 ADR 0012(技術顧問 2026-09-04 對 E04-S009 五題的裁定)寫的**提案**
(`phase-2.feature`)。**尚未合併**,等協調者送技術顧問確認。五個場景全部預期紅——
細節與每條紅的訊息原文見該次工單的回報,這裡只記結構性的發現。

**發現:ADR 0012 裁定 1 假設的資料今天不存在**。裁定 1 說 scopeKey 形狀是
`dept:<department.id>` / `group:<group.id>`,但 `db/migrations/202608280002_identity.sql`
的 `users` 表只有 `department TEXT` 與 `group_name TEXT` 兩個自由格式的**顯示名稱**欄位
——沒有 `department.id`、沒有 `group.id`,repo 裡任何地方都沒有部門/群組的 id 對照表
(用 grep 查過,不是用讀的猜的)。`apps/admin/src/lib/departments.ts` 是 admin console
自己的 sessionStorage mock,不是這個系統真正的部門資料來源。這代表:
- 裁定 1 定的是**鑰匙的形狀**,不是**鑰匙的值**——「資訊部」該對到什麼 id(`it`?
  一組 UUID?)仍然沒有人決定過,也不是本回合的範圍。
- 01-identity(裁定 2:「對應由 01-identity 單一維護」)要先加 id 欄位或一張
  部門/群組表,phase-2 的推導函式才有東西可讀。這可能是一次跨資料夾的 `/feature`
  (`01-identity` 的 schema 變更),需要協調者判斷要不要現在開,或先讓 phase-2
  的推導函式簽名假設「identity 給得出 id」,等 01-identity 補齊再串起來。
  寫進下面「待協調」。

**發現:裁定 4(顯式 ACL deny 蓋過 allow)今天的型別完全沒有承接的地方**。
`RetrievalScope` 只有 `allowedScopeKeys` 一個欄位,`toRetrievalScope()` 沒有任何
參數可以表達「這把鑰匙即使在允許清單裡也要被擋下」。`phase-2.feature` 的最後一個場景
就是在證明這個洞——今天用僅有的機制(grants 的聯集)去建 scope,一個被明確擋下的部門
仍然會被放行。這不是「哪裡寫錯了」,是型別本來就沒有這個維度,phase-2 的實作需要
擴充 `RetrievalScope` 的形狀(例如加 `deniedScopeKeys`)。

**沒有發現說不通的裁定**:裁定 3(聯集不是交集)在 `allowedScopeKeys` 這一層本來就是
純陣列/`Set`,沒有任何交集的程式碼路徑,所以只要未來的推導函式把 department 與
group 的鑰匙**攤平串接**餵給既有的 `toRetrievalScope()`,聯集語意就自動成立,不需要
新機制。裁定 5(單一 scopeKey,搬部門後原部門不可見)也**已經被 phase-1 的
`buildScopePredicate`/`assertNoScopeLeak` 完整涵蓋**(一份紀錄只有一個 `scopeKey`
欄位,換部門就是換這個值,既有的精確比對 Deny-Wins 已經處理)——phase-2 在這兩點上
不需要新場景,`phase-2.feature` 也沒有為它們寫紅場景(寫了也只會是綠的,不誠實)。

## phase-2b 提案(deny,2026-09-04,branch `pollux0971/authz-2b-deny`)

技術顧問 2026-09-04 依 ADR 0012 補齊了裁定 4(顯式 ACL deny)的**完整形狀**——這是上一輪
提案發現的「型別完全沒有承接的地方」那個洞的具體修法,擋著 I3:

1. **型別**:`RetrievalScope` 加 `deniedScopeKeys: readonly string[]`,**必填、無預設**。
   理由是 E06-S026 的教訓——可選就會被靜默略過;每個呼叫端明寫 `[]` 是誠實的。
   `toRetrievalScope` 的輸入同步必填,讓 typecheck 把所有呼叫端釘住。
2. **謂詞**:`buildScopePredicate` → `allowed.has(k) && !denied.has(k)`。
3. **SQL**:`buildScopeSql` 同義,denied 直接不進 `IN` 清單(前置過濾,不是查完再濾),
   並保留既有的 post-assert(兩層都要)。
4. **deny 的來源(ACL 表)不在這一輪**:呼叫端此刻全部傳 `[]`,來源留給 I3 之後的
   02 phase-3。場景用手填的 denied,不等 ACL 表。
5. 裁定 3(部門 ∪ 群組)與裁定 5(文件單一 scopeKey)已被既有機制滿足,不加場景
   (與上一輪相同的結論,不重複)。

**這一輪的交付**是把 `phase-2.feature` 原本那一條 deny 場景(只驗證核心 Deny-Wins)
拆成四條:

| 場景 | 顏色 | 驗證什麼 |
|---|---|---|
| An explicit denial on an allowed department overrides … | **紅** | 核心 Deny-Wins——允許清單裡的鑰匙一旦被明確 deny,今天的謂詞仍放行 |
| Denying a department nobody was ever granted changes nothing | 綠 | deny 不會意外放寬,今天已經成立,記錄底線 |
| An empty explicit-denial list leaves today's grants-only behaviour untouched | 綠 | 保證裁定 4「呼叫端全傳 `[]`」是安全的 |
| A denied department must not reach the database's IN list at all | **紅** | SQL 層的前置過濾——今天 `buildScopeSql()` 不認得 denied |

同義的四條 vitest 在新檔 `services/retrieval/src/authorization/deny.test.ts`(2 紅 2 綠,
理由同上表)。技巧與上一輪相同:不把 `deniedScopeKeys` 傳進 `toRetrievalScope()`
(那會撞 excess property check,紅在編譯),denied 清單留在測試/步驟自己的變數裡,
拿現有的 `buildScopePredicate` / `buildScopeSql` 對著它斷言「本該被擋下的東西沒被擋下」。

**這一輪沒有發現裁定說不通**。五條裁定與上一輪報告的兩個結構性依賴(裁定 1 缺 id、
裁定 4 缺型別)一致——裁定 4 這條這一輪已經由顧問補齊形狀,不再是開放問題;裁定 1
的 id 缺口仍未解除,見下方「待協調」與 `NEXT.md`。

**下一輪的反向驗證計畫**(這一輪做不了,因為承接 denied 的實作還不存在):開發 agent
完成 `RetrievalScope.deniedScopeKeys` 之後,審核者應該把
`buildScopePredicate` 最後一行的 `return allowed.has(k) && !denied.has(k);`
改回 `return allowed.has(k);`(拿掉 `&& !denied.has(k)`)——預期至少 1 個 vitest 紅
(`deny.test.ts` 第一條)、至少 1 個 cucumber 場景紅(`phase-2.feature`「An explicit
denial on an allowed department …」),紅的訊息應該點名被錯誤放行的 `scopeKey`
(例如「dept:it」),不是單純「expected false, got true」。SQL 層另外驗:
把 `buildScopeSql` 的 denied 排除邏輯拿掉,預期
「A denied department must not reach the database's IN list …」那條紅,
訊息應點名被錯誤放進 `IN` 清單參數的 `scopeKey`。兩段都要記還原後的 sha256/場景
全綠佐證,四段輸出進 commit body(`.feature` 層手動,見 `GHERKIN_WORKFLOW.md` §5.2)。

## phase-2b 完成(2026-09-04,第二、三輪)

第二輪(開發 agent)實作 `scope.ts`;第三輪(測試 agent,同日)接線。兩輪各自的發現:

**裁定 1(必填、無預設)實測行不通,已記錄的偏離**:開發 agent 把 `deniedScopeKeys`
做成字面上的必填(input 也不給 `?`)之後,`pnpm typecheck` 在 12+ 個 `*.test.ts` /
`features/steps/**` 檔案炸「缺少必要屬性」——`toRetrievalScope()` 當時在這些檔案裡
被呼叫 30+ 次,沒有一次帶這個欄位,而這些檔案依 GHERKIN_WORKFLOW §6 是開發 agent
不能改的。處理方式:`deniedScopeKeys` 在**輸入**上保留 `?`(省略視為 `[]`),**輸出**
的 `RetrievalScope.deniedScopeKeys` 保持非 optional、一律有值。理由與完整清單記在
`scope.ts` 的 `toRetrievalScope` 輸入型別上方注解與該輪 commit body。

**deny.test.ts / phase-2.feature 的兩條紅,不是實作的洞,是接線的洞**:第一輪(測試
agent)寫下這四條時,把 denied 清單留在區域變數裡,從未真正傳進 `toRetrievalScope()`
——這是刻意的(避免撞當時還沒加欄位的 excess-property-check)。開發 agent 做完
`scope.ts` 後,這個「留在區域變數裡」的技巧變成了阻擋兩條場景轉綠的真正原因:無論
`scope.ts` 怎麼實作,`buildScopePredicate(scope)` 拿到的 scope 一律是
`deniedScopeKeys: []`。第三輪(測試 agent)把 `features/steps/authorization.steps.ts`
第 91-111 行的兩個 `When` 步驟改成 `deniedScopeKeys: s.deniedKeys ?? []`,並把
`deny.test.ts` 的四次呼叫都改成傳真正的 `denied` 值,兩條紅才轉綠。同時把這兩條場景
與對應的 `Then` 步驟措辭從「描述缺口」(`but it does not` / `but it does`)改成「描述
行為」(`the scope refuses …` / `the filter does not include …`)。

**呼叫端補完**:`toRetrievalScope()` 當時在 12 個檔案、30+ 處呼叫,沒有一次帶
`deniedScopeKeys`。第三輪把它們(`*.test.ts` 與 `features/steps/{authorization,
ingestion,retrieval}.steps.ts`)全部明寫 `deniedScopeKeys: []`。`features/steps/
integration.steps.ts` 是共用檔(協調者的),裡面也有一處(`ask()` 函式),沒有改,
見下方「待協調」。

**結果**:`phase-2.feature` 的 8 個場景現在 4 紅 4 綠——4 紅是 2a 的 identity 轉換
Scenario Outline(不屬於 phase-2b,見上面「發現:ADR 0012 裁定 1 假設的資料今天不
存在」,繼續紅到 2a 做完),4 綠是 phase-2b 的 deny 場景全部轉綠;`deny.test.ts` 4/4
綠;`pnpm turbo run test --filter='!@ai-km/e2e'` 40/40。

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept -- --tags '@authorization and @phase-1 and not @manual and not @e2e'` → 9/9。
- 反向驗證(2026-09-04,回填時做,手動——`tools/mutate.mjs` 只驅動 vitest,這一層是 cucumber):
  `services/retrieval/src/authorization/scope.ts` 的 `buildScopePredicate` 把最後一行
  `return allowed.has(record.scopeKey);` 改成 `return true;` → 2 個場景紅(`9 scenarios
  (2 failed, 7 passed)`),第一條炸的是「The capability runs on its own」的
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

- **(2026-09-04,第三輪新增)`features/steps/integration.steps.ts:87` 是共用檔裡唯一
  漏掉 `deniedScopeKeys` 的呼叫端**:`ask()` 函式裡 `toRetrievalScope({ principalId:
  "i1-person", allowedScopeKeys })`。這是 I1 整合點的共用 steps,依 GHERKIN_WORKFLOW
  §6「共用檔只有協調者改」,測試 agent 沒有動它。行為不受影響(省略視為 `[]`,typecheck
  也過),純粹是為了「每個呼叫端明寫 `[]` 是誠實的」這個一致性,不是阻塞性問題,留給
  協調者判斷要不要補。
- phase-2b 這一輪改了 `phase-2.feature`、`authorization.steps.ts`、`ingestion.steps.ts`、
  `retrieval.steps.ts`、9 個 `*.test.ts`,新增/改 `deny.test.ts`,更新本檔案／`NEXT.md`,
  沒有動 `common.steps.ts`、`_world.steps.ts`、`standalone.json`、`package.json`、
  `cucumber.js`;`standalone.json` 的 `02-authorization` 條目已存在且指令正確,`expect`
  是 `"scenarios ("`,不必改成硬編碼的場景數。
- **(2026-09-04,phase-2 提案新增)01-identity 需要真的加入部門/群組的 id**:
  ADR 0012 裁定 1 的鑰匙形狀 `dept:<department.id>` / `group:<group.id>` 假設
  identity 那邊有 id 可讀,但今天 `users` 表只有顯示名稱兩欄,repo 裡沒有任何
  部門/群組 id 對照表。這是 phase-2 實作前必須先解決的依賴,而且很可能落在
  `01-identity` 的資料夾(schema migration + `AuthSessionBody`/`UserRow` 擴充或
  一個新的內部查詢函式給 02-authorization 讀),不是 `02-authorization` 能單方面
  做完的。協調者判斷:(a) 開一個對 `01-identity` 的 `/feature`,還是 (b) 讓
  phase-2 的推導函式先假設輸入已經是 id、把「identity 怎麼把 id 生出來」留成
  IMPLEMENT 階段的一個明確待辦(記在 IMPLEMENT 的 EVIDENCE/commit 而非再開一輪
  `/feature`)。兩條路都不违反鐵律 6(跨資料夾要走 owner 或 `/feature`),差別只是
  現在開還是留到 dev agent 動手時開。
- **(2026-09-04,phase-2b 已把形狀補齊)`RetrievalScope` 需要擴充才能承接裁定 4
  (顯式 deny 蓋過 allow)**:今天的型別只有 `allowedScopeKeys`,沒有任何欄位可以
  表達「即使在允許清單裡,這把鑰匙仍然要被擋下」。技術顧問已經裁定完整形狀
  (`deniedScopeKeys: readonly string[]`,必填無預設;`buildScopePredicate` →
  `allowed.has(k) && !denied.has(k)`;`buildScopeSql` 同義且 denied 不進 `IN` 清單,
  post-assert 兩層都保留),dev agent 實作 phase-2 時據此改
  `services/retrieval/src/authorization/scope.ts` 的 `RetrievalScope`/
  `toRetrievalScope()`/`buildScopePredicate()`/`buildScopeSql()`。這是「實作碼」,
  不在測試 agent 的允許修改範圍內,寫在這裡留給 dev agent 與審核者對照
  `phase-2.feature` 的四條 deny 場景與 `deny.test.ts` 的四條 vitest。
