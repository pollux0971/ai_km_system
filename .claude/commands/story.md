---
description: 依 STORY_WORKFLOW 自主開發一個 atomic story(開發→驗證→除錯循環→證據)
argument-hint: <Story ID,例如 E01-S001;留空則依垂直切片順序自動挑選下一個>
---

執行 story 自主開發循環,目標 story:`$ARGUMENTS`(若為空,依
`.claude/rules/STORY_WORKFLOW.md` 全域規則第 2 條的順序,從
`AI_KM_BMAD_High_Granularity/planning/TRACEABILITY.md` 與 `docs/stories/`
的已完成紀錄推算下一個未完成的 Team A story,並先向使用者確認再開始)。

步驟:

1. 完整讀取 `.claude/rules/STORY_WORKFLOW.md`,之後嚴格依其狀態機執行
   INIT → PLAN → IMPLEMENT → VERIFY ⇄ FIX → SELF-REVIEW → EVIDENCE → DONE/BLOCKED。
2. INIT 前先讀:
   - `AI_KM_BMAD_High_Granularity/prompts/STORY_EXECUTION_PROMPT.md`
   - `AI_KM_BMAD_High_Granularity/policies/`(三份全部)
   - 該 story 所屬 epic 檔中此 story 的完整章節
3. 全程遵守:不發明 contract、fail closed、mock 不算整合證據、
   禁止以任何方式讓紅燈假綠。
4. 結束時依 Phase 7 回報(DONE 或 BLOCKED,含 EVIDENCE 檔路徑)。

若 `$ARGUMENTS` 指定的 story 屬於 Team B 的 epic(E02/E04/E06/E08/E10/E12/E14),
停止並告知使用者:Team A 不實作該 story,只能為其建立 contract 草案與 mock。
**例外**:使用者 2026-08-28 指派 Team A 開發的增補 story(E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021)照常執行,
其允許修改清單可含 Team B 佔位資料夾與 `contracts/`(見 CLAUDE.md 鐵律 1/6 例外)。
