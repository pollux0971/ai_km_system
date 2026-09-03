---
description: 遇到不清楚的問題時,結構化分析並找出最優解(先查規格權威,再列選項,必要時才問使用者)
argument-hint: <問題描述;留空則從目前卡住的 context 推斷問題>
---

> **DEPRECATED(2026-09-03,ADR 0008)**:epic-story 開發方式已由分階段 Gherkin 取代。新工作請用 `/feature`、`/phase-done`、`/integrate`、`/decide`、`/sprint`(見 `.claude/rules/GHERKIN_WORKFLOW.md`)。本指令只保留給尚未收尾的舊 story(PROGRESS.md 中 in-progress / blocked 者),一個 sprint 後刪除。


以「技術顧問」身分處理問題:`$ARGUMENTS`(留空時,從當前對話/story 卡住的
狀況自行歸納出明確的問題陳述,先複述一次確認理解正確)。

## 演算法

### Step 1 — 問題定義
用三句話寫清楚:(a) 要做什麼決定 (b) 為什麼卡住 (c) 做錯的代價是什麼。
無法寫清楚 = 問題還沒理解,回去補讀 context。

### Step 2 — 查權威(多數「不清楚」規格早有答案)
依序查,找到即止:
1. `AI_KM_BMAD_High_Granularity/policies/`(三份 policy)
2. `AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md`(§5 的 40 條 pinned 決策
   、§10 架構原則)
3. 該 story 在 epic 檔中的開發邊界與 AC
4. `docs/adr/`(既有決策)與 `docs/stories/`(過往 EVIDENCE 的類似處理)
5. `AI_KM_BMAD_High_Granularity/readme_zh.md`(團隊分工與流程)

**規格有答案** → 引用確切出處,直接採用,記入 story EVIDENCE 的
assumptions,結束。

### Step 3 — 選項分析(規格真的沒答案時)
列出 2–4 個可行選項,每個評估:
- 與 policies / 架構原則的相容性(不相容者直接淘汰)
- 風險與可回退性
- 實作成本與對後續 story 的影響
- 是否會在 A/B 組介面產生耦合

給出**明確的推薦解 + 理由**,不要只擺選項。

### Step 4 — 決策權限判定
- **必須問使用者**(用 AskUserQuestion,推薦解放第一個選項):
  contract 新增/變更、安全/授權行為、跨 Team A/B 的介面、會影響多個 epic
  的架構選擇、難以回退的決定。
- **可自行採納推薦解**:單一 story 範圍內、低風險、可回退的純實作細節。
  採納後記入 EVIDENCE;若屬跨 domain 假設,另寫 ADR(`docs/adr/`)。

### Step 5 — 自主模式(被 /keep-working-till-end 呼叫時)
若正處於自主連續開發、且 Step 4 判定「必須問使用者」:
不中斷等待回答,改為 (a) 把問題+選項+推薦解完整寫入
`docs/stories/PENDING_DECISIONS.md`(無則建立) (b) 該 story 標
`blocked` 並在備註指向該檔 (c) 跳到下一個 story。使用者回來後統一批示。

### Step 6 — 落檔
無論結果為何,一句話摘要決策去向:採用了什麼/記在哪/誰要接手。
