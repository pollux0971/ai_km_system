# ADR 0008: 以「按能力切資料夾、分階段 Gherkin」取代 epic-story 開發方式

Status: Proposed（使用者 2026-09-03 指示：現行 epic-story 方式不穩定、遇到問題反應
弱，改為分階段的 Gherkin；範式依使用者於 `/data/python/llm_learning-cards` 建立的
敏捷開發範式移植，由技術顧問 ai-km-3a 起草，待使用者確認下方「待拍板」四點後
轉 Accepted 並開始遷移。）

## Context

### 現行方式的病灶（量出來的，不是印象）

- **272 個 story、253 approved**，其中 224 個在體驗層完成時核心 RAG 是 0 行。
  按團隊／按層橫切，價值要等兩邊都完才出現。
- **規格是模板**：E04 46 條只有 12 種內文、E06 40 條只有 2 種、E12 31 條只有 5 種。
  規格庫 `AI_KM_BMAD_High_Granularity/` 93,401 行，唯讀。
- **遇到問題的反應慢**：一個 story 的生命週期是七段狀態機 + spec 檔 + EVIDENCE 檔
  + 獨立審核；發現缺陷時的合法出口只有「開新 story」或「BLOCKED」，於是 Wave 1
  一天內衍生 E04-S065～S081 十七個編號，每個都要走一遍登記。
- **同一種病出現六次**：harness 沒走過它宣稱要測的機制（compat 閉包遮蔽、真 flock
  從未被測、turbo 不看 yaml、62 個 UNBOUND schema、10 個手抄副本、lock guard
  只在一台機器驗過）。這些是「規格與測試脫節」的症狀：規格在 markdown 裡，測試在
  另一個地方，兩邊沒有機械連結。
- Wave 1 用「垂直切片 + contract 先行 + 測試即規格 + 反向驗證」走通一條路
  （W1-00 一份真實 PDF 端到端，使用者 2026-09-03 親眼確認引用）。這證明另一種
  切法在本 repo 可行。

### 範式來源

`/data/python/llm_learning-cards`（使用者的專案，TypeScript + `@cucumber/cucumber`
+ vitest + stryker）。核心是四句話：**契約先於平行、規格先於程式、測試先於驗收、
決策留痕**。結構：

| 範式元件 | 意思 |
|---|---|
| `features/NN-name/` | 一個資料夾 = 一個**能力**（不是一個團隊、不是一層） |
| `phase-N.feature` | 一個 phase 一份 Gherkin，1–3 天做完；phase-1 完全獨立、只依賴 contracts |
| `FEATURE.md` | 範圍／不在範圍／依賴／技術棧／單獨執行指令／phase 表（唯一狀態來源） |
| `NEXT.md` | 目前 phase、下一個 phase 的三類 gate（自身／整合／契約）、gate 未滿足時該做什麼 |
| `docs/integration/iN-*.feature` | 整合點驗收，每個必有一個 `@e2e` 場景寫「**一個人做得到什麼**」 |
| `standalone.json` | 每個能力一行可跑的指令，phase 驗收時真的跑 |
| 五個指令 | `/feature` 分流（先提案再寫檔）、`/phase-done` 驗收、`/integrate`、`/decide` ADR、`/sprint` |
| DoD 四項核心 | 非 `@manual` 場景全綠、`@manual` 由人確認、單獨執行 exit 0、嚴格級變異達門檻 |
| Definition of Integrated | `@e2e` 由人親手確認（不能被測試代替）、`@regression` 全過、單獨執行全過 |

## Decision

### 1. 切法：按能力切資料夾，不按團隊、不按層

`features/` 建立以下能力資料夾。每個資料夾同時涵蓋它的 service、contract、UI 與
E2E——「能力」的定義是**使用者做得到的一件事所需的全部**。

| # | 資料夾 | 一句話 | 對應現有碼 | 對應舊 epic |
|---|---|---|---|---|
| 01 | identity | 登入、session、sandbox | `services/identity`、`auth.yaml`、`packages/auth-client` | E02 薄切片 |
| 02 | authorization | 部門／群組 → `RetrievalScope`（Deny-Wins） | **目前 0 行**（E04-S009 blocked） | E02 主體 |
| 03 | conversation | 對話、訊息、SSE 同步、修訂 | `services/conversation`、`conversations.yaml`、apps/web 聊天 | E03、E04-S039～S057 |
| 04 | model-gateway | embedding／generation／transcription 的唯一入口 | `services/model-gateway`、三份 yaml | E12 |
| 05 | ingestion | PDF → 文字 → chunk → 向量（含版本 metadata） | `services/ingestion`、`apps/worker-ingestion`（0 行） | E06 |
| 06 | retrieval | scope 前置過濾、向量庫、rerank | `services/retrieval` | E04 檢索側 |
| 07 | generation | context 組裝、引用回填、grounding 檢查 | `services/generation` | E04 生成側 |
| 08 | knowledge-management | 上傳、文件狀態、失敗處理、知識庫 UI | apps/web E05 頁面、`services/knowledge`（0 行） | E05 |
| 09 | feedback-analytics | OK/NG、原因、admin 指標 | `services/feedback`、`analytics.yaml`、apps/admin | E13 |
| 10 | admin-console | 部門、群組、connector、health | apps/admin | E11 |
| 11 | app-shell | 導覽、首頁、M3、跨視窗 | apps/web shell | E01 |
| 12 | audit-observability | 稽核紀錄、log、health | `services/audit`（0 行） | E14 |
| 13 | maintenance-assistant | 維修助理體驗 | apps/web E07 頁面（mock 後端） | E07、E08 |
| 14 | erp-reporting | ERP 報表體驗 | apps/web E09 頁面（mock 後端） | E09、E10 |

`contracts/openapi/*.yaml` 是範式裡的 `contracts/types.md`：**已凍結層**，改它走
`/decide` + 使用者。既有 compat gate、L2-EQ、binding coverage 是契約凍結的機械保證，
全部保留。新增 `contracts/fixtures/`：真實的中文 PDF（E06-S008 那份）、一組真實對話、
一份 admin 指標樣本——**真的檔案，不是規範**。

### 2. 整合點：每一個都是「一個人做得到什麼」

Wave 0 已經發生過（那 253 個 story）。從現在起只有整合點，嚴格依序：

| 整合 | 你做得到什麼 | 需要的 phase | 狀態 |
|---|---|---|---|
| **I1** | 一份真實 PDF 進去，引用能 slice 回原文（= W1-00） | 05/06/07/04 各 phase-1 | **已通過**（使用者 2026-09-03 確認） |
| **I2 ★** | 在 apps/web 問一個問題，答案來自 I1 的管線，點引用回到原文段落 | 03 phase-N（接 retrieve/answer）、07 phase-2、11 微調、`apps/api` 註冊 ingestion/retrieval/generation | 下一個 |
| **I3** | 兩個部門的人問同一題，各自只看到自己部門的文件；換部門後立刻生效 | 02 phase-1～2（RBAC 真的存在）、06 接 branded scope、E04-S009 解除 | |
| **I4** | 從 UI 上傳一份文件，看得到它排隊／處理／可問；壞檔會說原因 | 08 phase-1～2、05 phase-2（async、worker）、12 phase-1 | |
| **I5** | 對答案按 OK/NG，管理員在 admin 看到真實聚合 | 09 phase-2（已多半完成，接真資料） | |
| **I6** | 管理員從 admin 管部門與群組，改了 I3 立刻反映 | 10 phase-2、02 phase-3 | |
| **I7** | 稽核：誰在何時問了什麼、看到哪些文件，可匯出 | 12 phase-2 | |
| **I8** | 維修助理與 ERP 報表跑在真資料上（或明確標為 mock 展示） | 13、14 | 需使用者定義後端來源 |
| **I9** | on-prem 部署：一台機器 docker 起來，I2～I7 全部做得到 | E01-S028 的 image 接真服務 | |

**I2 是關鍵**：那是體驗層第一次接上資料層，也是產品第一次有價值。I2 之前不做任何
程式結構重構（ADR 0008 §「結構重構」裁示：程式重構訊號在 I2 之後才出現）。

### 3. 舊 story 的處置：封存，不重驗，但要「對得上」

- `docs/stories/PROGRESS.md`、`docs/stories/*.md`、`specs/` **凍結為歷史紀錄**，
  不再更新。頂端加一段：「2026-09-03 起以 `features/*/FEATURE.md` 為唯一狀態來源」。
- 每個能力資料夾的 **phase-1 是回填的**：`phase-1.feature` 的每個場景必須綁到一條
  **已存在**的測試（vitest／Playwright），綁法寫在 `FEATURE.md` 的「回填對照表」：
  場景名 → 測試檔:測試名。**沒有既有測試可綁的場景不得寫進 phase-1**——寫進 phase-2。
  這條防「回填變成另一種模板」：phase-1 的每一句都有機器證據。
- 回填由 `features/steps/` 的 step definition 直接呼叫既有測試同樣的入口（真實
  `buildServer()` inject、真實 service 函式），**不是把 vitest 測試名貼進 Gherkin
  當註解**。回填完成的判準：`pnpm accept --tags '@phase-1'` 全綠，且對每個資料夾
  至少一個場景做過 mutate 反向驗證（改壞 → 該場景紅）。
- `AI_KM_BMAD_High_Granularity/` 維持唯讀。其中真正有內容的（SOURCE_BASELINE 的
  11 個知識點、三份 policies）在 `FEATURE.md` 的「來源」欄引用；模板 story 不再引用。
- 舊 story 編號在 git 歷史與 PROGRESS 裡永遠可查；新工作不再發 EXX-SYYY 編號。
- **story 不映射成場景**（範式作者的明確建議）：story 是工作項，場景是行為規格，一對一
  映射會得到另一種模板。做法是：先寫每個資料夾的「範圍／不在範圍」，再拿 253 個
  approved story 逐張問「落在哪個資料夾的哪個 phase」——落得進去的，story 內容是那個
  phase 的**場景素材**；落不進去的，要嘛寫進「不在範圍」，要嘛暴露資料夾切錯。
  這張對照表一次做完，放 `docs/architecture/story-to-capability-map.md`，之後不維護。

### 4. 流程：五個指令取代狀態機；兩級制與反向驗證併入 DoD

| 舊 | 新 |
|---|---|
| `/story`、`/story-review`、`/keep-working-till-end`、`/progress` | 退場 |
| INIT→PLAN→IMPLEMENT→VERIFY⇄FIX→SELF-REVIEW→EVIDENCE | `/phase-done`（四項核心 + 選配） |
| spec 檔 + EVIDENCE 檔 | `phase-N.feature` + `/phase-done` 的輸出貼進 commit body |
| PROGRESS.md | 各 `FEATURE.md` 的 phase 表（狀態 `todo/ready/in-progress/done/blocked`） |
| PENDING_DECISIONS.md | `docs/adr/`（`proposed` 狀態）+ `NEXT.md` 的「契約 gate」指向它 |
| 獨立審核 `/story-review` | 嚴格級 phase 的 `/phase-done` 由**另一個 session** 執行；標準級自審 |
| 兩級制（重量級／輕量級） | **嚴格級／標準級**（判準不變：觸及授權／可見性／稽核，或失敗模式靜默 → 嚴格） |
| 反向驗證（mutate.mjs） | 併入 DoD：嚴格級每個 phase 至少一個場景做 mutate，證據進 commit body |
| `/advisor` | `/decide`（A 或 B 先查 ADR；沒有就問使用者再記） |

**遇到問題時的反應（這是使用者點名要修的）：**

| 情況 | 舊做法 | 新做法 |
|---|---|---|
| 做 phase 時發現缺陷 | 開新 story、登記、走狀態機 | 在**同一個** `phase-N.feature` **新增**一個場景（紅），修到綠。不開編號 |
| 發現新需求 | 使用者增補 story | `/feature <描述>`：分流成「新資料夾／既有資料夾新 phase／衝突 ADR／要動契約」，**先提案、等確認、再寫檔** |
| 依賴卡住 | `blocked-team-b` | `NEXT.md` 寫 gate 與「gate 未滿足時該做什麼」（可以先做的、不可以先做的） |
| 想改契約 | 問使用者 | 同左，但先 `/decide` 記 ADR proposed，NEXT.md 的契約 gate 指向它 |
| 場景寫錯（不是實作錯） | 窄例外、EVIDENCE 記錄 | 同樣：改場景要在 commit body 寫「改的是場景不是實作，理由」；**不得為了綠而改場景** |

**角色分工（範式作者在兩天實戰後定成規則，本 repo 照抄）：**

| 角色 | 能改什麼 | 不能改什麼 |
|---|---|---|
| Product owner（使用者） | `.feature`、契約、ADR 拍板 | — |
| 協調者 | 派工、合併、**共用檔**（package.json、lock、tsconfig、cucumber.js、common.steps.ts） | 不寫實作 |
| 測試 agent | 照 `.feature` 先寫 `features/steps/**` 與 `*.test.ts`（紅） | 不寫實作 |
| 開發 agent | 只寫實作，可以跑測試 | **不新增不修改 `*.test.ts` 與 `features/steps/**`** |
| 審核 agent（嚴格級） | 在 main 上重跑四項核心，含 mutate | 不改碼 |

機械守門：`git diff --name-only main...<branch> | grep -E '\.test\.ts$|^features/steps/'`
在開發 agent 的 branch 上有輸出 → 退回。這就是「避免改場景配合實作」的答案：實作者
沒有改規格與測試的權限，不靠自律。`.feature` 本身只由使用者或 `/feature` 流程經確認後改。

**分叉前先做 scaffold commit**（範式作者踩過的第一個坑）：workspace 骨架、依賴一次裝齊
並 commit lock、cucumber loader、`common.steps.ts`、兩個檢查腳本、`standalone.json`
落點表。共用檔只有協調者改。cucumber 的 `paths` 要排除 `features/_template/`。

**Gherkin 不變成新模板的三道守門（機械的，不靠自律）：**

1. `cucumber-js --strict`：未定義或 pending 的步驟 = 紅。場景不能只是文字。
2. `scripts/check-gherkin-dup.ts`：跨資料夾偵測**逐字相同的場景本體**，命中即 CI 紅。
   這條直接對著 E04 那 36 條相同內文的病。
3. phase-1 的第一個場景固定是「這個能力單獨跑起來會怎樣」，對 Fastify plugin 的
   定義是走真實 `register()→ready()` 並從父實例斷言 decoration（ADR 0007 §5）。

### 5. 技術綁定

- Runner：`@cucumber/cucumber` 11 + `tsx`（`NODE_OPTIONS=--import=tsx`）。設定檔
  `cucumber.js` 頂層 `export default { paths, import, tags, format }`，**不包
  `default:` 一層**（來源專案踩過：包了會讓全部步驟載入不到、162 個場景 undefined 卻
  不報錯）。
- World：`features/steps/_world.ts` 持有一個真實 `buildServer()`（in-process、
  `app.inject()`，不開 port）、暫存 SQLite、fake provider（PF1）、fixture 複製到
  暫存目錄。UI 場景標 `@e2e`，由既有 Playwright（`tests/e2e/`）承接，只在 CI 跑。
- 三個 CI job 維持（lint-typecheck-unit／contract-gate／e2e），新增 `accept` job
  跑 `pnpm accept --tags 'not @manual and not @e2e'`。
- 變異：本機用 `tools/mutate.mjs`（定向、輕）；stryker 只在 CI 對嚴格級資料夾跑，
  門檻依 `FEATURE.md`。使用者機器弱，這是刻意的。
- `standalone.json`：每個能力一行。service 類的指令是「用 fake provider 起 API、
  打一個代表性請求、印一個 marker」；UI 類標 `interactive: true`。

### 6. 團隊切法

Team A／Team B 的資料夾邊界（CLAUDE.md 鐵律 #6）**改為按能力資料夾的 owner**：每個
`FEATURE.md` 有 owner 欄。跨資料夾的改動走 `/feature` 分流。這是產品決策，
**待使用者拍板**（見下）。

### 7. 範式本身的驗證邊界（誠實記錄）

範式作者 2026-09-03 明講：範式定稿 2026-09-02，**只在 Wave 0（平行 phase-1）驗證過**
（11 個 phase-1 一天內全 done，502 單元測試、158 場景、0 邊界違規）；**整合層
（I1 之後的 DoI、`@regression`、Wave 0 重複的移除）還沒有實戰**，那部分是設計不是經驗。
去專案字眼的 `template/` 仍在抽取中，未審。

對本 repo 的意思：§1–§3 的能力資料夾與 phase-1 回填照抄；§2 的整合點規則照做但
**預期會修**，遇到不合理的回報範式作者，兩邊一起改，不單方面偏離也不硬套。

兩條作者的經驗法則一併採用：一個 phase **少於 3 個或多於 15 個場景都要懷疑**
（少了沒想清楚，多了在寫模板）；同一句步驟在兩個資料夾出現，只在 `common.steps.ts`
定義一次（cucumber 對重複定義直接報錯，這逼措辭統一）。

## 待拍板（使用者）

1. **能力資料夾的切法**：上表 14 個。要合併或拆開哪些？（我的建議：13、14 先不建
   資料夾，等 I8 定義後端來源再建；其餘 12 個建。）
2. **整合點順序**：I2→I3→I4→I5→I6→I7→I9 是我的排序（依賴＋風險＋商業價值）。I8 位置待定。
3. **舊 story 封存**：253 個 approved 不重驗、只回填能綁到既有測試的場景。同意？
4. **團隊邊界**：鐵律 #6 的 Team A／B 資料夾邊界改為 `FEATURE.md` owner。同意？

## Consequences

**變容易的**：發現問題的反應從「開編號、走狀態機」變成「加一個場景」。進度不再是
story 數，是「下一個整合點還缺哪幾個 phase」。規格與測試是同一個檔案，脫節在
`--strict` 下直接紅。

**變困難的／代價**：回填 12 個 phase-1 是一次性成本（估 2–3 個 sprint，可與 I2 平行）。
253 個 story 的細節不再被追蹤，只剩 git 歷史。已習慣 `/story` 的 session 要換指令。
Playwright 場景仍只能在 CI 跑，`@e2e` 的紅回饋慢。

**不變的**：contracts 凍結、compat gate、L2-EQ、binding coverage、`tools/mutate.mjs`、
fail-closed、Deny-Wins、ADR 0007。STORY_WORKFLOW 裡今天用血換來的規則（反向驗證對著會變
的量、失敗訊息才是證據、機制要量不要讀、驗收不是測試）全部搬進新的 workflow 文件，
一條不丟。

## 遷移步驟（Accepted 後）

1. 建 `features/_template/`、`features/README.md`、`cucumber.js`、`features/steps/_world.ts`、
   `standalone.json`、`docs/integration/README.md`、`scripts/check-gherkin-dup.ts`。
2. 寫 `docs/integration/i1-real-pdf-citation.feature`（把 W1-00 demo 改寫成 `@e2e @manual`
   場景，狀態已通過）與 `i2-ask-in-web.feature`（下一個目標）。
3. 逐資料夾回填 phase-1（先 05/06/07/04，因為 I1 已證明它們能動；再 01/03/09/10/11；
   02/08/12 的 phase-1 是「空殼單獨跑起來」）。每個回填 PR 附 mutate 證據。
4. 五個 skill 移植進 `.claude/skills/`；舊四個 skill 標 deprecated 一個 sprint 後刪。
5. `CLAUDE.md`、`.claude/rules/STORY_WORKFLOW.md` 改寫：狀態機章節退場，規則章節保留。
   PROGRESS.md 與 PENDING_DECISIONS.md 頂端加凍結說明。
6. I2 開工。
