---
description: 快速回報目前開發進度(讀 PROGRESS.md,不做任何修改)
---

唯讀操作,不改任何檔案:

1. 讀 `docs/stories/PROGRESS.md`,回報:
   - 總覽:approved / done / in-progress / blocked / blocked-team-b / todo 計數
     (若總覽表與明細列不一致,以明細列重算為準並指出不一致)
   - 目前 `in-progress` 的 story(若有)
   - 依開發順序推算的下一個 story
   - `blocked-team-b` 清單(= 目前欠 Team B 的東西)
2. 檢查 `docs/stories/PENDING_DECISIONS.md` 是否有未批示的問題,有則列出。
3. `git log --oneline -5` + 目前 branch + CI 最近一次結果,一併回報。
