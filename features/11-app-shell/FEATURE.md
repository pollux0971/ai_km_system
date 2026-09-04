# 11 · app-shell

## 一句話

一個人登入之後看到的那個框:側欄只放他的角色到得了的地方、首頁的捷徑不會比側欄多開一扇門、
整層皮(字級、圓角、陰影、色票)都是從同一份 Material 3 token 切下來的。

## owner

待指派(phase-1 回填由測試 agent 完成)。

## 範圍

- **導覽**:`NAV_ITEMS` 這張表(`apps/web/src/lib/nav-items.ts`)與從它長出來的三件事——
  側欄(`sidebar.tsx`)、首頁快速入口(`quick-entry-cards.tsx`)、路由 403 守門
  (`role-guard.tsx` 讀 `rolesRequiredFor`)。一張表,不是三份各自維護的清單。
- **首頁**:`(app)/page.tsx` 的框(大標 + 最近對話 + 快速入口),含磚上的「多久以前」
  (`format-time.ts`,E01-S024 AC3)。
- **Material 3 皮(ADR 0006)**:`packages/design-tokens`(typescale／shape／elevation／
  state layer／motion 的值、M3 色彩角色清單、WCAG 對比計算)、由品牌種子色產生並提交的
  `m3-theme.css`、以及 `apps/web/src/app/globals.css` 只從這兩者取值不自己寫死顏色。
- **跨視窗同步**:一個視窗做的事出現在另一個視窗(E03-S039 那條線的**外觀那一半**——
  header 的連線狀態列、側欄歷史對話列的重抓)。

## 不在範圍

- 登入、session、CSRF、sandbox 身分(→ `01-identity`)
- 對話本身的 CRUD、訊息、SSE 事件的**產生端**(→ `03-conversation`)
- 知識庫頁面(→ `08-knowledge-management`)、admin 頁面(→ `10-admin-console`)
- 真正的授權邊界。側欄與 `RoleGuard` 是 **UX 可見性**,不是 security control
  (`nav-items.ts` 自己的註解與 Frontend/UX Boundary 都這樣寫);真正的授權在
  `02-authorization` 與 `06-retrieval`。

## 來源

- 契約:無直接 HTTP 契約(shell 是前端框架層);跨視窗事件的訊息格式在
  `contracts/openapi/conversations.yaml` 與 `contracts/events/conversation-change-events.md`
- 舊 story(素材,不是規格):E01-S005/S006/S007/S008/S009/S011/S012/S013/S017/S018、
  E01-S021(M3 色彩)、E01-S022(自架字型與 Icon)、E01-S023(shell 的 M3 化)、
  E01-S024(首頁的 M3 化)、E03-S039(跨視窗同步)、E07-S006(巢狀路由繼承父層角色)
- ADR:0006(Material 3 token-first)
- 設計文件:[../../docs/design/app-shell-m3.md](../../docs/design/app-shell-m3.md)、
  [../../docs/design/home-m3.md](../../docs/design/home-m3.md)、
  [../../docs/design/m3-tokens.md](../../docs/design/m3-tokens.md)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@app-shell and @standalone and not @manual'
```

預期輸出:`17 scenarios (17 passed)`。全部在 node 裡跑(features 的 runner 是 node + tsx,
**沒有 jsdom**),不開瀏覽器、不起 server、不碰 DB:讀的是 `apps/web` 自己在 runtime 讀的
那幾個純資料入口與兩份樣式表。

> **注意**:根目錄 `standalone.json` 目前給 `11-app-shell` 的指令是
> `pnpm --filter @ai-km/web dev`(`interactive: true`)——那是人眼確認用的,不是這個 phase
> 的機器證據。上面這一行才是。兩件事都要,見「待協調」。

## 依賴

**phase-1(回填)**:只依賴 `apps/web/src/lib/`(nav-items、format-time)、
`apps/web/src/app/globals.css`、`packages/design-tokens/src/`。沒有跨能力依賴。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(引用可點、開原文段落面板) | I2 的 `06-retrieval`/`07-generation`/`03-conversation` phase-2 | 沒有真的答案與引用就沒有面板可開 |
| phase-2(跨視窗同步接進自動場景) | `features/tsconfig.json` 或 `packages/api-client` 其一調整(見「待協調」) | 現在綁 `conversation-events.ts` 會讓 `pnpm typecheck` 紅 |
| phase-2(rail/drawer/modal 斷點、元件層 UI 狀態) | 一個能跑 DOM 的驗收環境(jsdom 或 Playwright) | `computeNavMode` 只在畫面存在時才有意義 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `apps/web/src`、`packages/design-tokens/src` |
| 測試 | 既有 vitest(nav-items 12 條、format-time 10 條、globals-m3-tokens、generate-m3-theme)+ cucumber `phase-1.feature` 9 個場景(展開後 17 個)|
| 級別 | **標準** | 側欄與 `RoleGuard` 是 UX 可見性,不是授權邊界(`nav-items.ts` 自己這樣寫,真正的 Deny-Wins 在 `06-retrieval`);失敗模式也不靜默——導覽少一項、對比不足、深色沒換色,都是斷言當場抓得到的具體值 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)導覽可見性、首頁捷徑與時間、M3 token 不漂移與可讀性 | I1 | in-progress(自動證據全綠;`@manual`/`@e2e` 待使用者)| |

**phase-1 驗收細節(2026-09-04,獨立 session)**:自動那半**全過**——17 場景(9 個
Scenario/Outline 展開後 17,與 FEATURE.md 宣稱一致)、單獨執行 exit 0、typecheck 45/45、
lint 37/37、`--filter @ai-km/web` 1804 條、`design-tokens` 89 條全過。反向驗證獨立重做
(不沿用既有紀錄):拿掉 `nav-items.ts:89` `rolesRequiredFor` 的巢狀前綴比對,紅在**身分**:

```
AssertionError: 「/maintenance/mc-1/session」應要求 maintenance_engineer, super_administrator,實際要求 nothing in particular
AssertionError: 「/erp/new」應要求 sales_purchasing, super_administrator,實際要求 nothing in particular
```

還原前後 sha256 逐位元相同(`10c44eea…36abf`),回綠 17/17。

**§5.3「機制要用量的不要用讀的」實測**:FEATURE.md 宣稱「把跨視窗同步綁進自動場景會讓
`pnpm typecheck` 紅」。驗收者**真的去綁了一次**——臨時 step 檔 import
`apps/web/src/lib/conversation-events.ts` → 跑出**恰好 9 條** TS2834/TS2835,與 FEATURE.md
宣稱的數字完全吻合。這是實測不是照抄;臨時檔已刪、typecheck 回綠、worktree 乾淨。
所以 phase-2 要協調者改 `features/tsconfig.json` 或 `packages/api-client` 這件事**成立**。

**兩處文件落後於實況(協調者待補,不是功能缺口)**:
1. 「待協調」第 1 條(standalone 指令是互動式的)**已解決**——`a0e8d80` 已把 11 改成非互動
   且 `expect` 不釘數字。
2. 回填對照表**漏列兩條 `@manual` 檔案競態場景**(E03-S028,檔頭註明是
   `filelist-race-determinism` 工單的提案、等協調者確認)。它們不影響 17/17 的計數。

**phase-1 不是 `done`**:`/phase-done` 四項核心第二項是「`@manual` 人工確認」,本資料夾有
一條 `@e2e @manual`(跨視窗同步)加兩條 `@manual`。依 §5.4,自動斷言構不到「有人看過並接受」。
原文已抄進 `docs/DECISIONS_NEEDED.md`,使用者確認後才改 `done`。

| 2 | 引用可點、開原文段落面板;跨視窗同步進自動場景 | I2 | todo | |
| 3 | 斷點與元件層 UI 狀態(需要 DOM 環境) | 待定 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The shell stands up on its own, with no browser anywhere | `apps/web/src/lib/nav-items.test.ts`: shows everything to a super_administrator;`apps/web/src/app/globals-m3-tokens.test.ts`: type scale matches …(`typescale.displaySmall`) |
| The sidebar offers only the sections this person's roles reach | `apps/web/src/lib/nav-items.test.ts`: shows only the all-roles items to a general_user / additionally shows Maintenance … / unions visibility across multiple roles / fails closed for an unrecognized role string |
| Home never offers a shortcut the sidebar is hiding | `apps/web/src/lib/nav-items.test.ts`: shows Knowledge + ERP to a sales_purchasing user, but not Maintenance;excludes Home and Conversations |
| A page inside a section demands the roles that section demands | `apps/web/src/lib/nav-items.test.ts`: (E07-S006) inherits the parent's allow-list …;(E07-S006) does not match an unrelated route that merely shares a prefix string |
| The shell's stylesheet is cut from the token source, not hand-typed beside it | `apps/web/src/app/globals-m3-tokens.test.ts`: type scale / shape / elevation / state / motion match m3.ts;declares no hardcoded hex colors of its own |
| The shipped colour scheme is complete, and dark mode really repaints it | `packages/design-tokens/scripts/generate-m3-theme.test.ts`: Functional AC 1(light/dark 兩套角色齊全);Functional AC 6(每個角色在深淺之間換值,shadow/scrim 除外) |
| Text the shell puts on a coloured surface stays readable | `packages/design-tokens/scripts/generate-m3-theme.test.ts`: Functional AC 2(on-X/X 對比 ≥ 4.5:1) |
| A home tile says how long ago its conversation was last touched | `apps/web/src/lib/format-time.test.ts`: 5 分鐘前 / 3 小時前 / 剛好 7 天仍顯示「7 天前」 |
| Past a week the home tile gives a date instead of a vaguer "N 天前" | `apps/web/src/lib/format-time.test.ts`: 超過 7 天顯示日期,不是「30 天前」 |
| (`@e2e @manual`)A conversation started in one window turns up in the other window | 目前只有 vitest:`apps/web/src/lib/conversation-events.test.ts`、`conversation-events-context.test.tsx`、`(app)/_components/sidebar.test.tsx`。**沒有**綁進自動場景,原因見「待協調」第 2 條 |

> 兩份色彩場景讀的是**提交進 repo、`globals.css` 真的 `@import` 的那份** `m3-theme.css`,
> 不是當場再產生一次的副本——壞掉的時候使用者看到的是那份檔案,所以斷言也對著它。

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@app-shell and @phase-1 and not @manual and not @e2e'`
  → `17 scenarios (17 passed)`。
- 反向驗證(2026-09-04,回填時做,兩組):
  1. `apps/web/src/lib/nav-items.ts:89` 的 `rolesRequiredFor` 拿掉巢狀前綴比對
     (`|| pathname.startsWith(\`${item.href}/\`)`)→「A page inside a section demands the roles
     that section demands」兩列紅,訊息原文
     `AssertionError [ERR_ASSERTION]: 「/maintenance/mc-1/session」應要求 maintenance_engineer, super_administrator,實際要求 nothing in particular`。
     炸掉的是**身分**(要求哪些角色),不是「有沒有回傳東西」。
  2. `packages/design-tokens/src/m3.ts` 的 `typescale.displaySmall.fontSize` 由 `36px` 改 `35px`
     → 「The shell stands up on its own」紅在
     `AssertionError [ERR_ASSERTION]: 首頁大標的字級應為 36px,實際為 35px`,
     「The shell's stylesheet is cut from the token source」紅在
     `--md-sys-typescale-display-small-size: 樣式表「36px」≠ token「35px」`。
     兩處都還原(`sha256sum` 逐位元相同),還原後 17/17 綠。
- `@manual`:`@e2e @manual` 的跨視窗場景一條——**要使用者親手開兩個瀏覽器視窗確認**,
  自動測試不代它通過(GHERKIN_WORKFLOW §5.4)。另外 `standalone.json` 的
  `pnpm --filter @ai-km/web dev` 是同一件事的入口。

## 待協調(要協調者改共用檔的)

1. **`standalone.json` 的 `11-app-shell`**:目前是 `pnpm --filter @ai-km/web dev`
   (`interactive: true`),`/phase-done` 不會跑它,這個能力就沒有「單獨執行 exit 0」的機器證據。
   建議比照 06-retrieval 改成
   `{"cmd": "pnpm --filter @ai-km/features accept --tags '@app-shell and @standalone and not @manual'", "interactive": false, "expect": "17 scenarios (17 passed)"}`,
   把 dev server 那一行留在本檔的「驗收方式」當人工確認入口。
2. **跨視窗同步綁不進自動場景**:`apps/web/src/lib/conversation-events.ts`
   (`createConversationEventSource`,注入假 `EventSourceFactory` 就能在 node 裡驗訊息形狀、
   去重與連線狀態序列)本身完全可跑,但它 `import type … from "@ai-km/api-client"`,而
   `packages/api-client/src/index.ts` 的相對 import 沒有副檔名——`features/tsconfig.json` 是
   `moduleResolution: NodeNext`,一旦步驟檔 import 它,`pnpm typecheck` 就會多出 9 條
   `TS2834/TS2835`(實測,不是推論)。兩條可能的修法,擇一由協調者決定:
   (a) `packages/api-client/src/*.ts` 的相對 import 補上 `.js` 副檔名(它自己的 tsconfig 是
   Bundler,補了也不會壞);(b) `features/tsconfig.json` 改 Bundler 解析。
   任一條落地後,跨視窗同步的三個場景(訊息送達、重播不重複套用、斷線狀態序列)可以在
   phase-2 直接補進來。
3. **`common.steps.ts` 目前不缺句子**——本資料夾沒有要新增通用步驟。
4. **`standalone.json` 全域**:`pnpm --filter @ai-km/features accept -- --tags '…'` 這個寫法
   在本 worktree 的 pnpm 11.9.0 下會把 `--` 當成路徑參數傳給 cucumber 而失敗
   (`ENOENT: … open 'features/@retrieval and @standalone and not @manual'`),`06-retrieval`
   那一列也一樣。實測不是推論;拿掉 `--` 即可。這是既有問題,不是本 branch 造成的。

## 開放問題

- `computeNavMode`(1240 / 840 兩個斷點)是 `app-shell.tsx` 內部的非匯出函式,只有
  jsdom 的 `app-shell.test.tsx` 驗得到。要進 gherkin 需要一個 DOM 驗收環境;在那之前它
  留在 vitest,不在 phase-1 假裝有覆蓋。
- 「Past a week」場景斷言磚上出現 `2026` 而不是逐字比對 `toLocaleDateString("zh-TW")` 的輸出,
  因為那個輸出隨 ICU 版本而變;決定性的那一半(不再說「天前」)排在前面先炸。
- 首頁「最近對話」清單本身(`recent-conversations.tsx` 的載入／空／錯誤三態)目前只有
  jsdom 測試,同上,留給 phase-3。
- 側欄的 UX 可見性與真正的授權邊界目前是兩套獨立的表(`nav-items.ts` vs `packages/permissions`)。
  `02-authorization` 落地後要不要讓前者從後者推導,是一個未決的取捨。
