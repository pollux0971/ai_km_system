# policies/ — 最高權威(逐字複製自原始規格庫,2026-09-04)

三份檔案逐字複製自 `archive/AI_KM_BMAD_High_Granularity/policies/`(tag `baseline-bmad`),
**未改一字**。它們仍是 CLAUDE.md「參考順位」的第一位;衝突時以它們為準並回報。

| 檔案 | 在新範式裡怎麼讀 |
|---|---|
| `DEVELOPMENT_POLICY.md` | 12 條 Non-negotiable 原封適用。「story」讀作「phase」;「Branch / PR」段的 Story ID 讀作 `<NN-name>/phase-<N>`;Required gates 對應 `/phase-done` 四項核心 + CI 四個 job。 |
| `ATOMIC_STORY_BOUNDARIES.md` | 「Atomic Story 判定」的拆分訊號 = phase 太大的訊號(1–3 天原則);「Scope Freeze」= `.feature` 只由使用者或 `/feature` 改;「Cross-Team Rule」的 Team A／B 讀作能力資料夾 owner(ADR 0008);「AI Agent Rule」原封適用。 |
| `TESTING_POLICY.md` | L0–L6 是測試方法論分類,與 PF0–PF3(provider 保真度)是兩個軸,都要標。「Completion evidence」= `/phase-done` 的證據形式(commit body)。 |

修改這三份 = 改最高權威,只有使用者能做;要改先 `/decide` 記 Proposed ADR。
