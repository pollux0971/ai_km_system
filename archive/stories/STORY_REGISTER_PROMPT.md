# Story Register Prompt（zip 直接放專案根目錄版）

## 你要做的事

1. 把 `AI_KM_story_register_2026-08-28.zip` 放到你 repo 的**根目錄**
   （跟 `CLAUDE.md`、`package.json` 同一層），直接解壓覆蓋：
   ```bash
   cd /path/to/AI_KM
   unzip -o AI_KM_story_register_2026-08-28.zip
   ```
   這個 zip 裡的檔案全部是「既有檔案的修改版」或「新檔案」——
   epic 規格檔（`AI_KM_BMAD_High_Granularity/epics/*.md`）是在你原本的
   內容**後面追加**新 story，原有的 story 一字未動；`PROGRESS.md` 同樣
   是追加新列＋更新總覽數字。所以直接覆蓋是安全的，不會讓你丟失任何
   已 approved 的 story 內容。建議還是先 `git status`／`git diff` 看一眼
   再 commit。
2. 進到 repo 目錄，把下面這段貼給 Claude Code。

---

```
你現在要接手 AI KM monorepo 的一批使用者指派給 Team A 的增補 story。
剛剛有一個 zip 被解壓到專案根目錄，覆蓋了 epic 規格檔、PROGRESS.md、
ADR、以及一系列範圍說明文件。在寫任何程式碼之前，先做「註冊」：

## 第一步：確認 zip 已正確整合（不寫程式）

1. 讀 docs/stories/PROGRESS.md，確認總覽表與各 epic 章節能看到狀態為
   todo、備註含「使用者 2026-08-28」字樣的新 story 列。
2. 對每個 epic 檔（AI_KM_BMAD_High_Granularity/epics/*.md）用
   `grep -c "^# EXX-S"` 確認實際 story 數與檔頭「Atomic stories: N」
   一致，且與 PROGRESS.md 總覽表對得上。
3. 若發現任何不一致（數字對不上、story 內容看起來被截斷、或既有
   已 approved 的 story 段落消失了）→ 立刻停下回報，不要自己修改
   規格庫去讓數字對上。

## 第二步：讀範圍與規則（不寫程式）

依序完整讀完：
1. CLAUDE.md（注意「例外」段落——本批 story 有 Team B 資料夾與
   contracts/ 的授權例外，且已指派 Team A 開發）
2. .claude/rules/STORY_WORKFLOW.md（唯一開發演算法，逐字遵守）
3. AI_KM_BMAD_High_Granularity/policies/ 三份 policy
4. docs/architecture/voice-persistence-sync-m3.md（語音／持久化／同步／
   M3 批次：架構圖、依賴圖、4 條平行 lane、檔案交集矩陣）
5. docs/architecture/tech-debt-audit-2026-08-28.md（技術債稽核，含
   第一輪與第二輪發現，共 15 個修復 story）
6. docs/adr/0003～0006（API/DB/SSE、ASR、session/test-sandbox、M3 決策）
7. docs/stories/PENDING_DECISIONS.md（M3 視覺假設，未回覆前先照假設做）
8. docs/stories/specs/INDEX.md（44 個 story 的一覽表：標題、優先序、
   大小、HARD 依賴、批次；每個 story 另有一份獨立規格檔
   docs/stories/specs/EXX-SYYY.spec.md，內含完整開發範圍、依賴 story、
   四類 AC、允許/禁止修改清單——開發單一 story 時讀這一份即可，不必翻
   數十萬字的 epic 檔）

## 第三步：回報你的理解（不寫程式）

用你自己的話簡短回報：
- 這批 story 一共幾個、分別要做什麼（epic 分組列，一行一個即可）
- 依賴圖裡哪些 story 現在**沒有 HARD 依賴**、可以立刻開工
- 你打算先做哪一個、理由是什麼

等我確認後才開始 Phase 0 INIT。

## 第四步：開發

- 一次只做一個 story，完整走 STORY_WORKFLOW 的 INIT→PLAN→IMPLEMENT→
  VERIFY⇄FIX→SELF-REVIEW→EVIDENCE→DONE。
- Phase 0 INIT 讀規格時，讀 docs/stories/specs/EXX-SYYY.spec.md 即可
  （它是 epic 章節的逐字副本）；若有疑義以 epic 檔為準。完成證據仍寫在
  docs/stories/EXX-SYYY.md（與 .spec.md 是不同檔案）。
- 每個 story 開工前先確認 PROGRESS.md 裡它的 HARD 依賴是否已 approved；
  沒有就換下一個可開工的 story，不要硬做。
- SOFT 依賴（L3/L5 整合證據）未完成時，正常做到 L0/L1/L2，把需要 L3
  的部分列為待補，不得標 DONE。
- 規格不明、多種做法難以取捨、連續除錯無進展 → /advisor，不要用猜的。
- 需要修改 contract 但不在本批授權清單內 → BLOCKED，不要自己補。
- 每個 story 完成後更新 PROGRESS.md 對應列與總覽表，回報：AC 覆蓋摘要 +
  EVIDENCE 檔連結 + 依 wave/lane 建議的下一個 story。

## 第五步：多 lane 平行（可選）

若要開多個 worktree／session 平行開發，依
voice-persistence-sync-m3.md 的「5. 平行開發 lane 建議」分配 4 條 lane，
技術債批次的 15 個 story 大多依賴這些 lane 的後端與前端 adapter，排在
對應 wave 之後——見各自 story 的「依賴關係（平行開發用）」。

## 第六步：持續稽核技術債（重複執行）

每完成一批 story（建議每 approve 5～8 個）或你覺得已經沒有現成 todo
可做時，主動做一次技術債稽核：

1. 用 `grep`／閱讀 EVIDENCE 找：新的 `TODO|FIXME|HACK`、新的
   `.skip(`／`.only(`／`test.fixme`、新的「永遠回傳」空值／零值／null
   的 stub、新引入但未接線的 guard／驗證邏輯、production 可觸發但
   應該有開關卻沒有的「模擬」路徑、任何 story EVIDENCE 裡自承的
   「假設」「限制」「等真後端」字樣。
2. 找到問題後，比照 docs/stories/PENDING_DECISIONS.md 模板與既有 story
   的完整格式（Metadata / 技術決策 / Scope / 依賴關係(平行開發用) /
   四類 AC / 開發邊界含共通 boundary 段落逐字保留 / Non-Goals /
   Test Obligations / DoD / Anti-hallucination Guard），寫成新 story
   直接插入對應 epic 檔尾端（沿用使用者已明示的規格庫覆蓋授權），同時
   在 docs/stories/specs/ 產生對應的 EXX-SYYY.spec.md 副本並更新
   specs/INDEX.md，在 docs/architecture/tech-debt-audit-2026-08-28.md
   新增一輪稽核章節、PROGRESS.md 登記新列與更新總覽數字。
3. 回報新增了哪些 story、為什麼，等我確認優先序後再排進開發佇列。
4. 如果這一輪稽核沒有找到新問題，明確說「本輪無新發現」，不要為了
   湊數硬生出 story。
```

---

## 使用說明

- 這是**純檔案覆蓋**，不是 git patch，所以你不需要處理 merge conflict；
  但一定要在你自己的 git repo 裡做（`unzip -o` 之後 `git status` 看
  diff），這樣不滿意隨時可以 `git checkout` 復原。
- 如果你的 repo 目錄結構跟這次上傳的 zip 不同（例如你自己重新命名過
  資料夾），先比對一下 `unzip -l AI_KM_story_register_2026-08-28.zip`
  列出的路徑跟你的實際結構是否一致，不一致就手動調整路徑再覆蓋。
- 目前累計 **44 個新 story**（29 語音/持久化/同步/M3 ＋ 11 第一輪技術債
  ＋ 4 第二輪技術債），全部狀態 `todo`，尚未有任何一個開始開發。每個
  story 都有一份獨立規格檔 `docs/stories/specs/EXX-SYYY.spec.md`，一覽表
  在 `docs/stories/specs/INDEX.md`。
