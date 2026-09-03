---
description: 自主連續開發 Team A stories(story→review→merge 循環),直到只剩需要 Team B 才能繼續的工作為止
argument-hint: (可選)本輪最多完成的 story 數,例如 5;留空 = 不設上限
---

> **DEPRECATED(2026-09-03,ADR 0008)**:epic-story 開發方式已由分階段 Gherkin 取代。新工作請用 `/feature`、`/phase-done`、`/integrate`、`/decide`、`/sprint`(見 `.claude/rules/GHERKIN_WORKFLOW.md`)。本指令只保留給尚未收尾的舊 story(PROGRESS.md 中 in-progress / blocked 者),一個 sprint 後刪除。


進入自主連續開發模式。目標:把 Team A 的 story 一路推進到「**剩下的工作全部
需要 Team B 加入才能繼續**」為止(即 PROGRESS.md 中不再有可動工的 `todo`,
剩餘皆為 `approved` / `blocked-team-b` / 等使用者批示的 `blocked`)。
`$ARGUMENTS` 若給了數字,完成該數量的 story 後也停止。

## 前置檢查(任一不過 → 停止並回報,不進入循環)

1. `git status` 乾淨(無未提交變更)且位於 main、與 origin/main 同步。
2. `docs/stories/PROGRESS.md` 存在且可解析。
3. `pnpm typecheck && pnpm lint && pnpm test` 在 main 上是綠的(起點健康)。

## 主循環

```
while true:
  1. SELECT:讀 PROGRESS.md,依開發順序(E01→E03 優先,其後 E05→E07→E09→
     E11→E13)取第一個 `todo`(或可續作的 `in-progress`)story。
     取不到 → 跳到「收尾報告」。
  2. DEV:對該 story 完整執行 /story 流程(嚴格遵守
     .claude/rules/STORY_WORKFLOW.md 狀態機,含其 5 次 FIX 上限)。
     結果 BLOCKED → 執行 /advisor 流程(自主模式,見其 Step 5):
       - advisor 能自行解 → 解除後回到 DEV 續作(同一 story 限一次)。
       - 需 Team B → PROGRESS 標 `blocked-team-b` + 備註缺的 contract,continue。
       - 需使用者 → 問題寫入 docs/stories/PENDING_DECISIONS.md,
         PROGRESS 標 `blocked`,continue。
  3. REVIEW:DEV 成功(done)後,切換獨立審查者視角執行 /story-review 流程。
       - APPROVE → 進 4。
       - REQUEST-CHANGES → 回 DEV 修復後重審;同一 story 最多 2 輪重審,
         仍不過 → 視同 BLOCKED 走 advisor 分支。
  4. MERGE:story branch merge 回 main(--no-ff,message 含 Story ID)、
     push origin main、PROGRESS 標 `approved` 並更新總覽表。
     等待/確認 GitHub Actions CI 綠;CI 紅 → 立即修復(算入該 story 的
     FIX 循環),連 CI 都修不綠 → revert merge、標 `blocked`、continue。
  5. REPORT:向使用者輸出一行進度(「✅ EXX-SYYY approved(N/175),
     下一個:...」),然後 continue。
  6. 若已達 $ARGUMENTS 的數量上限 → 跳到「收尾報告」。
```

## 安全煞車(觸發任一 → 停止循環並完整回報,不硬衝)

- 連續 **3 個** story 都以 blocked 收場(可能有系統性問題:環境壞了、
  contract 普遍缺失、對規格理解有誤)。
- 同一 story 觸發第 **2** 次 advisor 仍無法推進。
- main 上的 gate 意外變紅且一次修復未果。
- git 出現非預期狀態(衝突、detached HEAD、遠端 diverged)。
- 任何情況下都**禁止**:force-push、跳過 gate、繞過 STORY_WORKFLOW、
  動 Team B 資料夾或規格庫(例外:使用者 2026-08-28 指派的增補 story 依其
  允許修改清單觸碰 Team B 資料夾,仍不得動規格庫;story 挑選時優先依
  `docs/architecture/voice-persistence-sync-m3.md` 的 wave 順序,HARD 依賴
  未 approved 的 story 不得開工)。

## 收尾報告(循環結束時必出)

1. 本輪完成清單:story ID + 一句話摘要 + EVIDENCE 連結。
2. `blocked-team-b` 彙總:**整理成「給 Team B 的 contract 需求清單」**
   (每項:story ID、需要的 endpoint/schema/行為、建議的 contract 草案位置)
   ——這份清單就是 B 組開工時的交接文件。
3. `blocked`(待使用者)彙總:指向 `docs/stories/PENDING_DECISIONS.md`。
4. PROGRESS 總覽表現況(approved/done/blocked/todo 計數)。
5. 若因 context/session 限制中斷:直接說明「重開 session 後再跑
   /keep-working-till-end 即可從 PROGRESS.md 續作」——tracker 就是斷點。
