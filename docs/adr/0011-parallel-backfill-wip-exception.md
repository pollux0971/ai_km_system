# ADR 0011: 回填期間一次開 11 條線,而不是 WIP ≤ 2–3

Status: Accepted(2026-09-04,使用者在協調者 session 直接指示)

## Context

`GHERKIN_WORKFLOW.md` §2 的 `/sprint` 規則寫 **WIP ≤ 2**;`/autopilot` §3 放寬到
**回填期間 ≤ 3**(理由:回填不改實作)。2026-09-04 使用者在協調者 session 直接指示:
「11 個 phase-1 回填一次全開(每個一個 worktree),合併時一次一個並以 check-step-dup
為門檻」。

範式來源專案的 PITFALLS **P-05** 說得很清楚:「WIP ≤ 2 的建議跟全平行互相矛盾,
agent 不知道聽哪個」,而它給的解法**不是**選一邊,是「**打破建議時記 ADR,不默默做**」。
這份 ADR 就是那個動作。

## Decision

**回填(Wave 0,12 個 phase-1)這一次,WIP 上限是 11。** 這是對 `/sprint` 與 `/autopilot`
既有上限的一次性例外,不改那兩份規則檔,也**不延伸到 phase-2 之後的任何工作**。

允許的理由(三條都成立才適用,缺一條就退回 ≤ 3):

1. **回填不改實作。** 每個 worker 的 branch diff 只准出現
   `features/NN-name/{FEATURE.md,NEXT.md,phase-1.feature}` 與 `features/steps/<name>.steps.ts`,
   合併時以 `git diff --name-only main...<branch>` 機械檢查。11 條線之間**沒有實作衝突面**。
2. **共用檔在分叉前就凍結了**(PITFALLS P-01)。`package.json`(全部)、`pnpm-lock.yaml`、
   `turbo.json`、`tsconfig*`、`features/cucumber.js`、`features/steps/_world.ts`、
   `common.steps.ts`、`standalone.json`(12 個 key 已備齊)、`.github/**` 全部只有協調者改;
   worker 需要動就寫進自己 `FEATURE.md` 的「待協調」段。11 個 worktree 全部從同一個
   commit(`ee4fac4`)開出,開完逐一 `git merge-base --is-ancestor main HEAD` 驗過(P-18)。
3. **剩下唯一的真衝突面——步驟句子撞名——有機械守門,而且它在分叉前就存在了。**
   `features/scripts/check-step-dup.ts`(commit 6069681)在合併點抓跨資料夾定義同一句的情況。
   撞名的正常解法是把該句搬進 `common.steps.ts`(協調者的檔),不是叫 worker 重寫。

## Consequences

**容易了什麼**:回填是 12 個彼此獨立的能力,序列化跑 11 條線的唯一收穫是「比較好管」,
代價是 5–6 個 sprint 的牆鐘時間,而它**不擋任何後續工作**(I2 的 phase-2 可以跟回填並行)。

**難了什麼,以及怎麼擋**:

| 風險 | 擋法 |
|---|---|
| 步驟句子撞名(P-02);每個 worker 看不到另外 10 個在寫什麼 | `check-step-dup`(已存在);合併**一次一個**,每合併一個就跑一次;撞到的句子由協調者搬進 `common.steps.ts` |
| 場景抄成模板(11 份 phase-1 長得一樣) | `check-gherkin-dup`(已存在);brief 明寫「第一個場景不要逐字抄 06」 |
| 某個資料夾的能力 tag 打錯,`accept:phase1` 照樣全綠、那個資料夾一條都沒跑 | `features/scripts/check-phase1-coverage.ts`(commit ee4fac4,本輪新增,已做反向驗證) |
| 11 個 worker 的自主判斷沒人審(P-29) | 每個 worker 的回報必須列出自主判斷清單;`/phase-done` 逐一破壞驗證 |
| 合併衝突集中在最後 | 合併一次一個、`--no-ff`,每次合併後其餘 worktree `git rebase main` |

**誰受影響**:協調者(合併點的工作量集中);嚴格級資料夾的 `/phase-done` 仍須由**另一個
session** 跑(GHERKIN_WORKFLOW §5.1),這一點**不因平行而放寬**。

**這份 ADR 不授權**:phase-2 之後照 `/autopilot` 原本的 WIP;要再破一次上限就再記一份 ADR。
