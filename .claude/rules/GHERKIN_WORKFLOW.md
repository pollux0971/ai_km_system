# 分階段 Gherkin 開發流程(ADR 0008,2026-09-03 起)

本文件取代 `STORY_WORKFLOW.md` 的狀態機,作為本 repo 唯一的開發演算法。`STORY_WORKFLOW.md`
保留為歷史與規則出處,其中「工作分級」以下用血換來的規則**全部搬到本文件 §5**,一條不丟。

儀式越少越好,但四件事不能省:**契約先於平行、規格先於程式、測試先於驗收、決策留痕**。

## 1. 結構

| 東西 | 位置 | 意思 |
|---|---|---|
| 能力資料夾 | `features/NN-name/` | 一個資料夾 = 一個能力(使用者做得到的一件事所需的全部),不是團隊、不是層 |
| phase | `features/NN-name/phase-N.feature` | 一個 phase 一份 Gherkin,1–3 天做完;**測試就是規格** |
| 狀態 | `FEATURE.md` 的 phase 表 | **唯一狀態來源**:`todo / ready / in-progress / done / blocked` |
| 下一步 | `NEXT.md` | 目前 phase、下一個 phase 的三類 gate(自身／整合／契約)、gate 未滿足時該做什麼 |
| 整合點 | `docs/integration/iN-*.feature` | 每個必有一個 `@e2e` 場景寫「一個人做得到什麼」;由使用者親手確認 |
| 現況 | `docs/roadmap.md` | 目前整合點、回填進度、未排程 |
| 契約 | `contracts/openapi/*.yaml` | 凍結層;compat gate + L2-EQ + binding coverage 機械保證;改它走 `/decide` + 使用者 |
| 決策 | `docs/adr/` | ADR 只增不刪;`proposed` = 待使用者;`NEXT.md` 的契約 gate 指向它 |
| 單獨執行 | `standalone.json` | 每個能力一行指令,`/phase-done` 真的跑 |
| 反向驗證 | `tools/mutate.mjs` | 每個 phase 至少一個場景改壞會紅,證據進 commit body |

## 2. 五個指令(取代 `/story`、`/story-review`、`/keep-working-till-end`、`/progress`、`/advisor`)

| 指令 | 做什麼 | 何時 |
|---|---|---|
| `/feature <描述>` | 新需求分流:新資料夾／既有資料夾新 phase／與 ADR 衝突／要動契約。**先提案、等確認、再寫檔** | 任何新想法、缺陷擴大成需求、依賴卡住要改切法 |
| `/phase-done <NN-name>/<phase-N>` | 驗收一個 phase:四項核心(場景綠、`@manual` 人確認、單獨執行 exit 0、嚴格級反向驗證)+ 選配 | phase 做完 |
| `/integrate <IN>` | 驗收整合點:`@e2e` 貼原文給使用者問「你做得到嗎」、`@regression` 全過、單獨執行全過、stub 已移除 | 整合點的 phase 全 done |
| `/decide <描述>` | 記 ADR:先評估契約影響(硬約定要使用者),再寫五欄位 | 任何 A 或 B 的取捨,含 agent 自己做的 |
| `/sprint [週]` | 讀所有 `NEXT.md` 算 ready、WIP ≤ 2、標出卡在契約 gate 的(使用者可立刻解除) | 週一,或問「接下來做什麼」 |

## 3. 生命週期

```
想法 → /feature(提案→確認→寫 .feature,狀態 todo)
     → NEXT.md gate 全滿足 → ready
     → /sprint 挑進本週 → in-progress
     → 測試 agent 先寫 steps + 單元測試(紅)→ 開發 agent 寫實作(綠)
     → tools/mutate.mjs 反向驗證(嚴格級必做)
     → /phase-done → done,更新 NEXT.md、解鎖別人
     → 整合點所有 phase done → /integrate → 使用者親手確認 @e2e
     → 取捨 → /decide
```

## 4. 遇到問題時怎麼反應(這是換掉 epic-story 的理由)

| 情況 | 做法 |
|---|---|
| 做 phase 時發現缺陷 | 在**同一個** `phase-N.feature` **新增**一個場景(紅),修到綠。不開編號、不走狀態機 |
| 明顯 bug 且不改行為 | 直接修,commit 寫 `fix`,**必補一個會失敗的測試** |
| 發現新需求 | `/feature`。先提案等確認,不直接寫檔 |
| 依賴卡住 | `NEXT.md` 標 `blocked`、寫 gate 與「gate 未滿足時可以先做什麼／不可以先做什麼」;其他資料夾繼續 |
| 想改契約 | `/decide` 記 ADR `proposed`,`NEXT.md` 契約 gate 指向它,等使用者;**不得單方面改** |
| 場景寫錯(不是實作錯) | 可以改場景,但 commit body 寫「改的是場景不是實作,理由」;沒把握就當實作錯 |
| 一個需求橫跨 3 個以上資料夾 | 停,`/feature` 拆;拆不開就是新資料夾 |
| 「不 import 別的資料夾就做不下去」 | 這是契約缺東西的訊號,停下來 `/decide`,不是偷 import |

## 5. 規則(從 STORY_WORKFLOW 原封搬來,對所有 phase 一視同仁)

### 5.1 級別

| | 嚴格級 | 標準級 |
|---|---|---|
| 適用 | 觸及 RBAC／授權範圍／稽核／資料可見性,**或**失敗模式是「靜默給出錯誤結果」 | 其餘 |
| 反向驗證 | **每個 phase 必做**,`tools/mutate.mjs` 證據進 commit body | 至少一個場景做過 |
| `/phase-done` 由誰跑 | **另一個 session**(不共享開發者脈絡、自己重跑) | 自審可 |

「靜默給出錯誤結果」:壞掉時沒有東西報錯,輸出看起來合理但是錯的。例:embedding 換版後排序全錯、
授權算太窄使用者只看到「查無資料」。「切塊偏移量算錯」不算——一條 slice 斷言當場抓到。
疑義時預設嚴格級;證明責任在想減負的一方。

### 5.2 反向驗證

- 每一項工作至少一個:把實作改壞,指定的場景必須紅,還原後綠,兩段輸出都記錄。
- **斷言對著「壞掉時會變的量」**:分數、順序、內容、身分。存在性斷言不算(有結果、長度>0、沒拋錯)。
  排序壞掉仍有順序、過濾壞掉仍有筆數、嵌入壞掉仍有向量;會變的是值。
- **證據是炸掉那條斷言的失敗訊息原文**,不是紅的條數。審核者確認訊息說的是決定性性質,不是副作用。
  同一場景多條斷言時第一條炸的決定紅的意義——決定性比對放最前,或拆兩個場景。
- **vitest 層級**優先用 `tools/mutate.mjs`(它只驅動 vitest,解析 vitest JSON reporter)。
- **`.feature`(phase／整合點)層級目前是手動的**:備份 → 突變 → 跑 cucumber 取紅的訊息原文 → 用備份
  bytes 還原 → `sha256sum`/`md5sum` 逐位元比對 → 重跑回綠,四段都進 commit body。
  讓 `mutate.mjs` 支援 cucumber 是一個待排的 phase(等 main 上 E04-S083 的 signal 修復落地後再動同一個檔)。

### 5.3 機制要用量的,不要用讀的

斷言一個工具或環境「會怎樣」之前先跑一次。從原始碼、man page、yaml 順序推斷的機制寫進紀錄就
變成別人相信的事實。2026-09-02 一天兩次:flock 對不存在的鎖檔自己建檔(失敗的是父目錄),
turbo 平行跑所以單元測試在 CI 有跑只是不可見。結論可能仍對,理由錯了會導出錯的下一步。

### 5.4 驗收不是測試

使用者指定的結果檢查(I1 的真實 PDF、I2 的 web 提問)**不是 story 也不是測試**,它要的是使用者
親眼看過。紀錄分開標:「X 的自動斷言成立;驗收本身待使用者確認」。不得用自動斷言冒充驗收,
也不得為了不冒充而抹掉驗證過的檢查。

### 5.5 誰擁有畫線的文件,誰決定線能不能動

story／phase 的允許範圍若由協調者的 spec 縮窄,協調者可事後放寬(獨立 commit、寫明是審核發現);
若線在使用者的規則檔(CLAUDE.md、契約),只有使用者能動。peer 之間不能互相授權,轉述不算授權。

### 5.6 gate 的限制附在有未決發現的檢查上,不附在 package 上

一個工具裡兩個檢查,一個有使用者未決的分歧、一個零未決 → 只接零未決的那個進 gate,
另一個照印但不影響 exit code,分割寫進 README 與 ROADMAP。

### 5.7 安全鐵律(不變)

Authorization 先於 retrieval;Deny-Wins;未授權資料不進 context/citation/export/log;
前端與 BFF 不直連 DB / vector store,只透過 `@ai-km/api-client`;secrets 不進 source/fixtures/logs。
會 `decorate()` 的 Fastify plugin 一律 `fp()` 包裝,並至少一條走真實 `register()→ready()` 的場景(ADR 0007 §5)。

## 6. 角色與機械守門(ADR 0008 §4)

| 角色 | 能改 | 不能改 |
|---|---|---|
| 使用者(PO) | `.feature`、契約、ADR 拍板、規則檔 | — |
| 協調者 | 派工、合併、共用檔(package.json、lock、tsconfig、`cucumber.js`、`common.steps.ts`) | 實作 |
| 測試 agent | `features/steps/**`、`*.test.ts`(先寫,紅) | 實作 |
| 開發 agent | 實作,可以跑測試 | **`*.test.ts`、`features/steps/**`、`.feature`** |
| 審核 agent(嚴格級) | 在 main 重跑四項核心,含 mutate | 碼 |

```bash
git diff --name-only main...<branch> | grep -E '\.test\.ts$|^features/steps/|\.feature$' && echo "RETURN TO SENDER"
```

`.feature` 只由使用者或 `/feature` 流程經確認後改。

## 7. Gherkin 不變成模板的機械守門

1. `cucumber-js --strict`:未定義／pending 的步驟 = 紅。場景不能只是文字。
2. `pnpm gherkin:dup`:跨檔逐字相同的場景本體 → CI 紅。
3. phase-1 第一個場景固定是「這個能力單獨跑起來會怎樣」;整合檔必有 `@e2e`。寫不出來就是切錯了。
4. 一個 phase 少於 3 或多於 15 個場景都要懷疑。
5. 步驟只准用使用者語言(不寫 "calls retrieve()",寫 "asks a question")。
6. **裸跑 `pnpm accept`(不帶 `--tags`)會列出所有 todo 整合點的 undefined 步驟(例如 I2)**——那是「還沒做」不是「弄壞了」。
   驗收一律帶 `--tags`;`accept:integration` 只跑已通過的整合點。

## 8. 最小模式

覺得儀式比程式多時,縮到:`contracts/`、每個 phase 的 `.feature`、`/phase-done` 的四項核心、`@e2e` 場景。
可以先關的:sprint 檔、`/integrate` 完整清單、標準級的 mutate、`NEXT.md` 維護(關了 `/sprint` 會給爛建議)。
**不要關掉的是契約與 Gherkin。**

## 9. 什麼時候要停下來問使用者

- 需求與契約、ADR 衝突;想改 `contracts/`
- 需要新的資料夾／Team B 資料夾授權(在 `FEATURE.md` owner 制落地前)
- 一個需求橫跨 3 個以上資料夾;估計超過一個 sprint 的 phase
- 任何「這樣做好像比較快但跟規則不一樣」的念頭
