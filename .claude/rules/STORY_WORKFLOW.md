# Story 自主開發審核除錯循環(Story Autonomous Dev-Review-Debug Loop)

> **Superseded by `.claude/rules/GHERKIN_WORKFLOW.md`(2026-09-03,ADR 0008)。**
> 本檔的狀態機不再是新工作的演算法,只適用於 PROGRESS.md 中尚未收尾的舊 story
> (in-progress / blocked)。「工作分級」以下的規則(反向驗證對著會變的量、失敗訊息才是
> 證據、機制要量不要讀、驗收不是測試)已原封搬進 GHERKIN_WORKFLOW §5,以那裡為準;
> 本檔保留為出處與歷史,不再修改。

本文件是本 repo 唯一的 story 開發演算法。任何 AI agent 或人類要實作 atomic story
(`E01-S001` 格式)時,必須逐字遵守此流程。與本文件衝突的臨時指示,除非使用者
明確說「本次覆蓋 STORY_WORKFLOW」,一律以本文件為準。

本文件是 `archive/AI_KM_BMAD_High_Granularity/prompts/STORY_EXECUTION_PROMPT.md` 與三份
policies 的執行層落地,不取代它們;若發現衝突,以 policies 為最高權威並回報。

---

## 狀態機總覽

```
INIT → PLAN → IMPLEMENT → VERIFY ⇄ FIX → SELF-REVIEW → EVIDENCE → DONE
  │                         │                │
  └── BLOCKED ←─────────────┴────(修復循環達上限或缺少 contract)
```

任何狀態遇到「未知 endpoint / schema / permission / service」→ 立即轉 BLOCKED,
**禁止發明**(fail closed)。

---

## Phase 0 — INIT(讀取,不寫程式)

0. **Progress Tracker 檢查**:開啟 `archive/stories/PROGRESS.md`(進度唯一真相
   來源),確認該 story 目前狀態:
   - `todo` → 改為 `in-progress`,填入 branch 名,立即提交 tracker 變更。
   - `in-progress`(前次 session 中斷)→ 檢查既有 branch 與 diff,從中斷點續作,
     不重頭做。
   - `done` / `approved` → 停止並回報「此 story 已完成」,不重做。
   - `blocked` / `blocked-team-b` → 先驗證備註中的阻塞是否已解除;未解除
     → 停止並回報,不硬做。
1. 從 `archive/AI_KM_BMAD_High_Granularity/epics/` 對應檔案完整讀取該 story 的所有小節:
   Metadata、Scope In/Out、Preconditions、四類 Acceptance Criteria
   (Functional / Security-Authorization / Data-Contract / UX)、開發邊界
   (允許修改/禁止修改)。
2. 讀取該 story 依賴的 contract(`contracts/openapi/` 等)與相關 ADR(`docs/adr/`)。
3. 檢查 Preconditions / HARD dependencies 是否滿足(先前 story 是否 DONE、
   contract 是否存在)。
4. **BLOCKED 判定**:所需 contract / endpoint / schema / permission 不存在
   → 產出 BLOCKED 報告(見 Phase 7),明確列出缺少的 contract 名稱與需要
   Team B(或使用者)提供的確切內容。不寫任何猜測性程式碼。

## Phase 1 — PLAN(範圍凍結)

1. 將每一條 Acceptance Criterion 映射到「要改的檔案 + 要寫的測試」清單。
2. 確認每個要改的檔案都落在 story 的「允許修改」邊界內;任何「禁止修改」
   清單內的檔案一律不碰。
3. Change Budget:計畫外的修改一律不做。實作中發現必要的計畫外變更 →
   记入 EVIDENCE 的 assumptions,若涉及跨 domain → 停止並轉 BLOCKED。
4. 一個 story 一個 branch:`story/EXX-SYYY-短描述`(從 main 分出)。

## Phase 2 — IMPLEMENT(TDD:先寫測試,再寫最小實作)

1. **先寫測試,後寫實作**:依 Phase 1 的 AC→測試清單,在動任何實作程式碼之前,
   先把這個 story 全部要寫的自動化測試(unit/contract/E2E,視 story 性質)寫好。
   此時測試預期是紅的(實作還不存在或不完整)——這是正常現象,不是要修的錯誤。
2. **測試內容自此凍結,只增不減**:測試寫好、進入實作之後,測試內容原則上
   不能修改,只能新增(新發現的情境、SELF-REVIEW 補的測試都算新增,允許),
   不能刪除既有測試,也不能修改既有測試的斷言/邏輯來配合實作。目標永遠是
   讓實作符合測試,不是讓測試符合實作。
   - 唯一例外(狹窄、需誠實記錄):VERIFY/FIX 階段發現某個失敗其實是「測試
     本身的技術性錯誤」(用錯 assertion API/matcher、selector/文字打錯字、
     測試步驟的順序邏輯本身有誤),而不是這個測試原本想驗證的行為需要放寬
     ——見 Phase 4 第 5 點的完整處理方式。
3. 最小可上線變更(smallest production-valid change),不順手重構、不擴scope。
4. 安全鐵律(邊寫邊自查):
   - Authorization 先於任何受保護的 retrieval/action。
   - Deny-Wins;未授權資料不得進入 context/citation/export/log/analytics。
   - 前端/BFF 不直連 DB 或 vector store;只透過 `@ai-km/api-client` 的
     typed client 呼叫凍結後的 contract。
   - Secrets 不進 source/fixtures/logs/prompts。
5. Mock 只能用來解除平行開發阻塞,mock 通過不得標記為 integration 證據。

## Phase 3 — VERIFY(gate 執行,順序固定)

依序執行,全部指令與 exit code 記入 EVIDENCE:

```
L0: pnpm typecheck        → 必須 0
L0: pnpm lint             → 必須 0
L1: pnpm test (unit)      → 必須 0,禁止 passWithNoTests / skip / force-exit
L2: contract test         → contract 存在時必跑
L3: integration           → 該 story 是 integration story 時必跑(mock 不算)
L4: security-negative     → story 含 Security AC 時必跑(至少:未授權存取被拒)
L5: E2E critical flow     → story 屬關鍵流程時必跑(tests/e2e)
```

任一 gate 失敗 → 進入 FIX。全部通過 → 進入 SELF-REVIEW。

## Phase 4 — FIX(除錯循環)

1. 讀完整錯誤輸出 → 定位根因 → 修正 → **從 VERIFY 第一個 gate 重跑**
   (不得只重跑失敗的那一個)。
2. 循環上限 **5 次**。同一個錯誤連續 2 次以相同方式修不好 → 換診斷路徑
   (加 log、縮小重現、檢查假設),不得重複同樣的修法。
3. 達上限仍紅 → 轉 BLOCKED,附:每次嘗試的診斷、修法、結果。
4. 絕對禁止:跳過測試、放寬 assertion、刪除既有測試、修改既有測試內容來讓
   gate 變綠、`--force`、`|| true`、標記 skip。這些行為視同造假。測試只能
   新增,不能刪除或修改既有內容(見 Phase 2 第 2 點)。
5. **狹窄例外——測試本身的技術性錯誤**:定位根因後,如果發現失敗不是實作
   邏輯有問題,而是測試本身寫錯(用錯 assertion API/matcher、selector/文字
   打錯字、測試步驟的順序邏輯本身有誤——例如自己疊加兩個操作互相抵銷),
   允許修正該測試。但必須:
   - 在 EVIDENCE 誠實記錄修正前後差異,以及判斷「是測試錯而非實作錯」的
     具體理由;
   - 不得用這個例外掩護「實作其實不符合 AC,把測試改鬆來配合」的情況——
     對「是測試錯還是實作錯」沒有把握時,預設當作實作錯處理,不修測試;
   - 這個例外不算違反第 4 點的鐵律,但仍計入本次 FIX 循環次數,且修正後
     一樣要從 VERIFY 第一個 gate 重跑。

## Phase 5 — SELF-REVIEW(以審查者身分重看一次)

切換視角,依此 checklist 逐項回答(記入 EVIDENCE):

- [ ] 每條 AC 都有對應實作 + 對應測試?(逐條列出 AC → 測試名)
- [ ] 有無 scope 外變更?(diff 中每個檔案都在允許清單內?)
- [ ] 有無發明 contract 未定義的 endpoint/欄位/權限?
- [ ] Security AC:未授權路徑真的被測過且被拒?錯誤格式符合 contract?
- [ ] UX AC:error / loading / empty / permission-denied 狀態都有處理?
- [ ] 有無留下 debug 殘留(console.log、註解掉的程式、TODO 無 ticket)?
- [ ] 是否有任何「mock 通過就當作整合完成」的宣稱?

任何一項不通過 → 回 IMPLEMENT/FIX 修正後重新 VERIFY。連續 2 輪
SELF-REVIEW 仍過不了同一項 → BLOCKED。

## Phase 6 — EVIDENCE(證據落檔)

在 `archive/stories/EXX-SYYY.md` 寫入(模板見 `archive/stories/README.md`):

- Story ID、branch、日期、最終狀態(DONE / BLOCKED)
- 變更檔案清單、contract/migration 差異(無則寫 None)
- 每個 gate 的確切指令、exit code、關鍵測試名
- SELF-REVIEW checklist 結果
- Assumptions / 計畫外變更 / 未解疑問
- Rollback 方式(通常:revert 該 branch 的 commits)

同時更新 `archive/stories/PROGRESS.md` 該 story 列(狀態、Branch、Evidence 連結、
備註)與總覽表計數,和 EVIDENCE 檔一起提交。

## Phase 7 — DONE / BLOCKED 收尾

**DONE**:
1. commit message 含 Story ID(例:`feat(E01-S001): ...`)。
2. 推 branch;PR 標題含 Story ID,描述含 scope / contract diff / 測試 /
   security impact / rollback(依 DEVELOPMENT_POLICY.md)。
3. PROGRESS.md 狀態改 `done`;之後 `/story-review` 通過並 merge 回 main 時
   改 `approved`。
4. 向使用者回報:AC 覆蓋摘要 + EVIDENCE 檔連結 + 下一個建議 story。

**BLOCKED**:
1. 不 commit 半成品到 main;可留在 story branch。
2. PROGRESS.md 狀態改 `blocked`(等使用者/問題排除)或 `blocked-team-b`
   (需要 Team B),備註欄寫明缺少的確切 contract/資訊。
3. 向使用者回報:卡住的確切原因、缺少的 contract/資訊、已嘗試的修復、
   建議的解除方式(找 Team B 定 contract / 使用者決策 / 先做別的 story)。

---

## 工作分級(2026-09-02 立)

前 224 個 story 全部走完整狀態機。那買到了紀律,也買到了 18 次 `降級`、
5 次 `補做獨立審核`、28 次 `稽核` —— 大量流程成本花在「改一個常數」和
「決定一個部門的維修紀錄會不會出現在另一個部門的答案裡」上,而這兩者用同一
套流程。本節把它們分開。

**本節不修改上方的狀態機。** 重量級走的就是上方那一套,一字未改;輕量級是新增
的第二條路徑,讓它在規則上合法存在,而不是靠「這次算雜項」私下繞過。

### 判準

| | 重量級 | 輕量級 |
|---|---|---|
| **適用** | 觸及 RBAC／授權範圍／稽核／資料可見性,**或**失敗模式是「靜默給出錯誤結果」 | 其餘所有工作 |
| **流程** | 完整狀態機:INIT → PLAN → IMPLEMENT → VERIFY ⇄ FIX → SELF-REVIEW → EVIDENCE | 先寫測試 → 綠 → 反向驗證 → PROGRESS.md 一行 + 一段話 |
| **spec 檔** | 需要 | **不寫** |
| **EVIDENCE 檔** | 需要 `archive/stories/EXX-SYYY.md` | **不寫**,PROGRESS.md 備註欄一段話即可 |
| **獨立 review** | 需要(`/story-review`) | **不需要** |
| **規格來源** | epic／spec 檔 | **測試本身就是規格** |

**「靜默給出錯誤結果」的意思**是:壞掉的時候沒有任何東西會報錯,輸出看起來
合理但是錯的,而且錯得不明顯。範例:embedding 模型換版後排序全錯但不報錯;
授權範圍算錯導致召回率下降,使用者只看到「查無資料」。**相對地**,「切塊偏移量
算錯」不算 —— 一條 `text.slice(start, end) === chunk.text` 的斷言就能當場抓到,
它不是靜默的。

### 分級看的是「這項工作改變的行為」,不是它碰到的檔案

把一份已測過的邏輯**原封搬到另一個目錄**,若邏輯逐字不變、既有測試整批跟著搬且
全綠、原有的反向驗證仍然會紅,那它改變的行為是零,分級為輕量。
**新增或改變授權判斷本身**才是重量級。

搬移類工作要在 PROGRESS.md 備註寫明「邏輯逐字不變」並附 diff 佐證;做不到就
不是搬移,是改寫,回重量級。

### 兩級共同的底線:反向驗證

**每一項工作都必須包含至少一個反向驗證:把實作改壞,指定的檢查必須變紅,
還原後變綠。兩段輸出都要記錄。**

**沒有可失敗檢查點的工作項不得標 done。** 一個從未被證明會紅的守門不算守門;
一組從未紅過的測試不算規格。這條對重量級與輕量級一視同仁,不因輕量而豁免。

**反向驗證優先使用 `tools/mutate.mjs`**(E04-S070),證據塊貼進 commit body;
手動做的要說明**為何工具不適用**。

工具做人工做不到的三件事:它要求突變字串**恰好出現一次**(否則拒絕,不做全換);
它**直接呼叫 vitest 而不經 turbo**(熱快取會回放舊結果,製造出這個工具要抓的那種
假陰性);它以 sha256 驗證還原,**不碰 git 狀態**。它的 exit code 帶著本節的區分:
**2 = 突變後仍綠(守門不響)**,**4 = 紅但不是斷言失敗**,
**5 = `--expect-message` 指定但紅在錯的原因上**。

⚠️ **用 `--expect-message` 時,決定性的內容必須在錯誤訊息的文字裡。**
工具跑 vitest 的 `--reporter=json`,而該 reporter 會把失敗的 `toEqual` 物件 diff
**截斷成 `…(N)`**——所以 `--expect-message` **比對不到只出現在被截斷 diff 裡的東西**。
(2026-09-02 E04-S079 實測。)

這不是要你改斷言去遷就工具:**斷言仍然要對著會變的值**。它要的是**把那個值也放進訊息**
——例如 `throw new Error(\`... extra=${JSON.stringify(extra)} missing=${...}\`)`,
或用 `expect(x, \`具體差異:${diff}\`)` 的第二參數。
**一條紅得對、但訊息說不出為什麼的斷言,在自動驗證下與紅得不對無法區分。**

**反向驗證的斷言必須對著「實作壞掉時會改變的量」——分數、順序、內容、身分。
存在性斷言不算反向驗證**:「有拿到結果」「長度大於零」「沒有拋錯」都不算。

這條不是理論。2026-09-02 E06-S042 做第二組反向驗證(把向量全部存成零)時實測發現:
`hits.length > 0` **不會變紅**——top-K 檢索不管分數高低都回傳 K 筆,所以一個完全
壞掉的 embedding 管線,在「有沒有拿到結果」這個問題上看起來與正常運作一模一樣。
必須另外斷言分數(`score > 0`)才抓得到。

推論到一般情況:**排序壞掉時仍然有順序,過濾壞掉時仍然有筆數,嵌入壞掉時仍然有
向量。** 會變的是那些值,不是它們存不存在。設計反向驗證時,先問「這個實作壞掉之後,
哪一個**數字或字串**會不同」,再對著那個東西寫斷言。

**反向驗證的證據是炸掉的那條斷言的失敗訊息,不是紅的條數。** 記錄必須引用該訊息
原文;審核者必須確認那條訊息說的是這項工作的**決定性性質**(資料不變、分數、順序、
身分),而不是它的**副作用**(沒拋錯、型別不對)。

同一個測試裡有多條斷言時,**第一條炸的決定了紅的意義**——把決定性性質的比對排在
最前面,或拆成兩個測試各斷言一件事。

2026-09-02 E06-S043 實測:`.rejects.toBeInstanceOf(...)` 排在資料逐筆比對之前,
守門拿掉後測試紅在 `promise resolved "undefined" instead of rejecting`,**資料
比對從未執行**;而紅的條數前後完全相同(7 failed / 34 passed)。開發者、evidence
檔與第一輪讀數字的人都以為證明了「資料不變」,實際證明的是「有拋錯」——正是這條
規則上一段禁止的那種斷言。

### 機制要用量的,不要用讀的

**斷言一個工具或環境「會怎樣」之前,先跑一次。** 從原始碼、man page 或 yaml 的
順序推斷出來的機制,寫進紀錄就會變成別人相信的事實,而它可能是錯的。

2026-09-02 同一天兩次:
- 「`flock` 因為鎖檔不存在而失敗」——**錯**。鎖檔不存在時 `flock` 自己建檔、
  回 exit 0。真正失敗的是**父目錄**不存在(exit 66)。這個差別決定修法:
  依錯誤版本寫出來的修法**永遠不會觸發**。
- 「單元測試排在 playwright 後面,所以在 CI 上跑不到」——**錯**。turbo 平行跑,
  CI log 顯示 `36 successful, 42 total`,只有 e2e 紅。真正成立的說法窄得多:
  它們的結果**不可見**,不是沒跑。

兩次都是從讀推斷,不是從跑。**結論可能仍然對,但理由錯了就會導出錯的下一步。**

### 驗收檢查點(結果檢查)不是測試,不得用「通過」一詞收掉

使用者指定的結果檢查(例如 W1-00「一份真實 PDF 端到端跑通,含真實引用偏移量
指回原文」)**不是 story,也不是測試**。它要的是**使用者親眼看過**。

紀錄必須把兩件事**分開標**,不得壓成一個詞:

> **X 的自動斷言成立;驗收本身待使用者確認。**

- **自動的那半**:寫明是哪一條會紅的檢查、失敗時怎麼失敗。這是真實資產,
  **不得因為驗收未完成就一併抹掉**。
- **驗收的那半**:寫明執行指令,並明說**在使用者執行並確認之前不算通過**。

兩個方向的錯都要避免:用自動斷言冒充驗收(高估),或為了不冒充而把驗證過的
檢查一起刪掉(低估)。**這是「綠的檢查代替了沒人驗證過的性質」在最上層的形態**
——這裡那個性質是「有人看過並接受」,而任何檢查都構不到它。

### 疑義時

不確定該哪一級 → **預設重量級**。分級是自己給自己減負,判斷成本必須由想減負的
那一方承擔。分級結果與理由寫在 PROGRESS.md 備註欄,審核者可以推翻。

---

## 全域規則

1. **一次一個 story**。未完成前不開下一個(使用者明示除外)。
2. **story 挑選順序**:使用者指定 > 垂直切片順序(E02→E01→E06→E04→E12→E03→E14
   中屬於 Team A 的部分)> epic 檔內的 sequencing 建議。Team A 只實作
   E01/E03/E05/E07/E09/E11/E13 的 story,**加上**使用者 2026-08-28 指派的
   增補 story(E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021;排程依
   `docs/architecture/voice-persistence-sync-m3.md` 的 wave/lane 與各 story
   的「依賴關係(平行開發用)」);遇到需要 Team B 的部分 → mock + 記錄。
3. **契約優先**:`contracts/` 是唯一真相來源。改 contract = 跨組事件,
   必須先問使用者,不得單方面改。(使用者 2026-08-28 已批准 E02-S031、
   E04-S038、E12-S029、E13-S018 四個 contract story 依其規格新增 yaml。)
4. **禁止修改**:`archive/AI_KM_BMAD_High_Granularity/`(規格庫,唯讀)、
   Team B 佔位資料夾(`apps/api`、`apps/worker-*`、`services/*`、`db/*`)。
   (例外:使用者 2026-08-28 明示授權並指派 Team A 的增補 story——
   E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021——限該 story 允許修改清單內的路徑,含 `infra/*`。)
   (例外:使用者 2026-09-02 核可的 **Wave 1**——E04-S009/S016、
   E04-S058～S067、E06-S008/S022/S026/S041/S042/S043、E12-S032～S033——可在該
   story 允許修改清單內修改 `services/retrieval|generation|ingestion|rag-skeleton`。
   見 README.md 的 2026-09-02 Wave 1 段落。
   （`services/rag-skeleton/` 已於 2026-09-02 由 E04-S064 退場，目錄不再存在；本段保留為授權紀錄，不再構成對任何路徑的修改許可。）)
5. **失敗誠實回報**:紅就是紅。任何 gate 未跑或未過,不得宣稱 DONE。
6. **進度唯一真相**:`archive/stories/PROGRESS.md` 是進度追蹤的唯一來源。
   每次狀態轉換立即更新並隨 commit 提交;不得只更新 tracker 而未實際完成
   對應工作(tracker 造假視同 gate 造假)。session 重啟後一律先讀 tracker
   還原進度,不憑記憶。
7. **不確定就問 advisor**:實作中遇到規格未明、多種做法難以取捨、或連續
   除錯無進展時,啟動 `/advisor` 流程分析最優解,不得憑感覺猜。
8. **TDD:測試先於實作,測試內容只增不減**:每個 story 動任何實作程式碼前,
   先把該 story 的自動化測試寫好(見 Phase 2)。測試寫定後只能新增,不能
   刪除或修改既有內容——唯一例外是測試本身的技術性錯誤(見 Phase 4 第 5
   點的窄例外,需誠實記錄,且不得用來掩護「實作不符合 AC」的情況)。目標
   永遠是讓實作符合測試,不是反過來。
