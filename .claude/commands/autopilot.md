---
description: 協調者的連續自主循環(ADR 0008 + CLAUDE.md 決策權段)。/sprint 挑 → 派工 → 等完成 → /phase-done → 合併 → 下一個;需要使用者的事寫進 docs/DECISIONS_NEEDED.md 就繼續做別的;只在 ready 集合為空且全部卡在使用者級 gate 時停。
---

# /autopilot — 協調者連續循環

使用者是**只要成果的老闆**。本指令讓協調者在 CLAUDE.md「決策權」段的授權範圍內一直做,
直到真的沒事可做。**不問使用者「要不要繼續」,不等使用者回覆,不停在可以自己決定的事上。**

參數(可空):`$ARGUMENTS` — `--max-phases N`(預設無上限)、`--dry`(只算不派)。

## 每一輪(loop body)

### 0. 讀規則,不憑記憶

每輪開始重讀:`CLAUDE.md`「決策權」與「鐵律」、`.claude/rules/GHERKIN_WORKFLOW.md` §4–§7、
`docs/roadmap.md` 現況表、`docs/DECISIONS_NEEDED.md`、範式作者的 PITFALLS.md(路徑見交接)。

### 1. 同步

在自己的合併工作面(`/data/python/AI_KM`,branch main):`git status` 必須乾淨(使用者的素材檔除外);
`git fetch`;CI 三個 job + accept job 的最新 run 狀態。CI 紅 → 先修紅(gate 修復永遠在範圍內),
再派新工。

### 2. 算 ready(= `/sprint` 第三步,不寫 sprint 檔也可以)

對每個 `features/*/NEXT.md` 算三類 gate。得到:
- `ready`:可派
- `blocked-by-user`:卡在使用者級 gate(契約放寬／新資料夾／付費／真模型／未定義功能)
- `blocked-by-integration`:等某個整合點通過
- `blocked-by-self`:等同資料夾前一個 phase

`blocked-by-user` 的每一項:確認 `docs/DECISIONS_NEEDED.md` 有對應列;沒有就**加一列**(一句話、類別、
建議、阻擋了什麼)。加完就不管它,繼續。

### 3. 挑

規則同 `/sprint` 第五步:carry-over 優先 → 目前整合點優先 → 依賴鏈優先;WIP ≤ 2 條線(**回填期間**
可到 3,因為回填不改實作);同一資料夾同時只有一個 phase in-progress。

沒有 ready 但有 `blocked-by-integration` 且該整合點的 phase 全 done → 跑 `/integrate`:
自動場景與單獨執行全檢自己做;`@e2e` 場景**寫成 DECISIONS_NEEDED 一列**(貼場景原文 + 「你做得到嗎」),
不等,繼續做其他不依賴該整合點的事。

### 4. 派

每個挑中的 phase 一個 worktree(`/data/python/AI_KM-worktrees/<NN-name>-phase-<N>`)、一個 agent。
有 `orchestration`(Orca)或 `orca-ide` skill 時用它派與等;沒有就用 Agent 工具。
brief 固定含:該資料夾三件檔、`features/README.md`、`steps/README.md`、`06-retrieval` 參考、
PITFALLS 相關條目、角色守門(測試 agent 先寫 steps 紅 → 開發 agent 綠 → 開發不碰 test/steps/.feature)、
反向驗證證據形式(§5.2)、「裸跑 accept 的 undefined 是預期」。
派出後在 `FEATURE.md` 改 `in-progress`、`NEXT.md`「進行中」更新,一個 commit。

### 5. 等

用 orchestration 的 `worker_done` / escalation wait;沒有就 `/loop` 心跳(建議 1200s)。
worker 回報「需要使用者」→ 判斷是不是真的使用者級(對照決策權表);**多數不是**——工程取捨由你或顧問定,
定了記 ADR,worker 繼續。真的是 → DECISIONS_NEEDED 一列,該 phase 標 `blocked`,worker 換做別的或收工。

### 6. 驗收

每個回來的 phase 跑 `/phase-done`。**嚴格級由另一個 session/agent 跑**(不共享開發脈絡);標準級自審。
沒過 → 退回同一個 worker,附失敗訊息原文;連續兩輪同一項沒過 → 換 agent 或升級顧問。

### 7. 合併

過了就 `--ff-only` 或 merge 進 main、推送;其他 in-progress worktree `git rebase main`。
PROGRESS 不更新(已凍結);`FEATURE.md` 狀態、`NEXT.md`、`docs/roadmap.md` 回填表由 `/phase-done` 更新。
一行回報給使用者(不是問題,是事實):`✓ <NN-name>/phase-<N> 合併 <hash>;下一個:…;待你:DECISIONS_NEEDED #k`。

### 8. 回到 1

## 停止條件(只有這三個)

1. `ready` 為空,**且**所有 `todo` 都是 `blocked-by-user`(含 `@e2e` 等親手驗收)→ 停,回報
   `DECISIONS_NEEDED.md` 全表,說明每條解除後會解鎖什麼。
2. `--max-phases N` 達到。
3. 連續兩輪 CI 紅且修不好 → 停,回報紅的訊息原文與已試的修法(不 `--force`、不 skip、不放寬)。

**不是停止條件**:worker 問問題(你或顧問答)、缺素材(換做別的)、整合點等 `@e2e`(做別的)、
契約需要收緊(顧問可批)、發現缺陷(同 phase 加場景)。

## 不會做的事(硬)

- 不合併紅的 gate、不 `--force`、不 skip、不放寬斷言、不改 `.feature` 讓它過
- 不放寬契約、不開新 endpoint、不開新資料夾、不動 Team B 路徑授權以外的碼——這些寫 DECISIONS_NEEDED
- 不在使用者的規則檔(CLAUDE.md、`.claude/rules/`、契約)上做「決策權」段以外允許的變更
- 不在別人的 checkout 上 commit(一個 checkout 一個 session)
- 不等使用者

## 回報格式(每輪一段,不多)

```
autopilot 第 N 輪 <時間>
- 合併:…
- 派出:…(worktree、agent、級別)
- 待驗收:…
- 新進 DECISIONS_NEEDED:#k 一句話
- 卡住(非使用者級,已自行裁定):…(ADR NNNN)
- 下一輪:…
```
