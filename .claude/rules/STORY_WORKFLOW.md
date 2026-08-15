# Story 自主開發審核除錯循環(Story Autonomous Dev-Review-Debug Loop)

本文件是本 repo 唯一的 story 開發演算法。任何 AI agent 或人類要實作 atomic story
(`E01-S001` 格式)時,必須逐字遵守此流程。與本文件衝突的臨時指示,除非使用者
明確說「本次覆蓋 STORY_WORKFLOW」,一律以本文件為準。

本文件是 `AI_KM_BMAD_High_Granularity/prompts/STORY_EXECUTION_PROMPT.md` 與三份
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

0. **Progress Tracker 檢查**:開啟 `docs/stories/PROGRESS.md`(進度唯一真相
   來源),確認該 story 目前狀態:
   - `todo` → 改為 `in-progress`,填入 branch 名,立即提交 tracker 變更。
   - `in-progress`(前次 session 中斷)→ 檢查既有 branch 與 diff,從中斷點續作,
     不重頭做。
   - `done` / `approved` → 停止並回報「此 story 已完成」,不重做。
   - `blocked` / `blocked-team-b` → 先驗證備註中的阻塞是否已解除;未解除
     → 停止並回報,不硬做。
1. 從 `AI_KM_BMAD_High_Granularity/epics/` 對應檔案完整讀取該 story 的所有小節:
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

在 `docs/stories/EXX-SYYY.md` 寫入(模板見 `docs/stories/README.md`):

- Story ID、branch、日期、最終狀態(DONE / BLOCKED)
- 變更檔案清單、contract/migration 差異(無則寫 None)
- 每個 gate 的確切指令、exit code、關鍵測試名
- SELF-REVIEW checklist 結果
- Assumptions / 計畫外變更 / 未解疑問
- Rollback 方式(通常:revert 該 branch 的 commits)

同時更新 `docs/stories/PROGRESS.md` 該 story 列(狀態、Branch、Evidence 連結、
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

## 全域規則

1. **一次一個 story**。未完成前不開下一個(使用者明示除外)。
2. **story 挑選順序**:使用者指定 > 垂直切片順序(E02→E01→E06→E04→E12→E03→E14
   中屬於 Team A 的部分)> epic 檔內的 sequencing 建議。Team A 只實作
   E01/E03/E05/E07/E09/E11/E13 的 story;遇到需要 Team B 的部分 → mock + 記錄。
3. **契約優先**:`contracts/` 是唯一真相來源。改 contract = 跨組事件,
   必須先問使用者,不得單方面改。
4. **禁止修改**:`AI_KM_BMAD_High_Granularity/`(規格庫,唯讀)、
   Team B 佔位資料夾(`apps/api`、`apps/worker-*`、`services/*`、`db/*`)。
5. **失敗誠實回報**:紅就是紅。任何 gate 未跑或未過,不得宣稱 DONE。
6. **進度唯一真相**:`docs/stories/PROGRESS.md` 是進度追蹤的唯一來源。
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
