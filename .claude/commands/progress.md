---
description: 快速回報目前開發進度(讀 PROGRESS.md,不做任何修改)
---

> **DEPRECATED(2026-09-03,ADR 0008)**:epic-story 開發方式已由分階段 Gherkin 取代。新工作請用 `/feature`、`/phase-done`、`/integrate`、`/decide`、`/sprint`(見 `.claude/rules/GHERKIN_WORKFLOW.md`)。本指令只保留給尚未收尾的舊 story(PROGRESS.md 中 in-progress / blocked 者),一個 sprint 後刪除。


唯讀操作,不改任何檔案:

1. 讀 `archive/stories/PROGRESS.md`,回報:
   - 總覽:approved / done / in-progress / blocked / blocked-team-b / todo 計數
     (若總覽表與明細列不一致,以明細列重算為準並指出不一致)
   - 目前 `in-progress` 的 story(若有)
   - 依開發順序推算的下一個 story
   - `blocked-team-b` 清單(= 目前欠 Team B 的東西)
2. 檢查 `archive/stories/PENDING_DECISIONS.md` 是否有未批示的問題,有則列出。
3. `git log --oneline -5` + 目前 branch + CI 最近一次結果,一併回報。
