---
description: 以獨立審查者身分審核一個已實作的 story(不改碼,只驗證與報告)
argument-hint: <Story ID,例如 E01-S001;留空則審核目前 branch 對應的 story>
---

> **DEPRECATED(2026-09-03,ADR 0008)**:epic-story 開發方式已由分階段 Gherkin 取代。新工作請用 `/feature`、`/phase-done`、`/integrate`、`/decide`、`/sprint`(見 `.claude/rules/GHERKIN_WORKFLOW.md`)。本指令只保留給尚未收尾的舊 story(PROGRESS.md 中 in-progress / blocked 者),一個 sprint 後刪除。


以「沒有參與實作的獨立審查者」身分,審核 story:`$ARGUMENTS`
(留空時從目前 branch 名稱 `story/EXX-SYYY-*` 推斷)。

規則:本命令**只讀與執行驗證,不修改任何程式碼**。發現問題就報告,
由使用者決定是否進入修復(修復請另跑 `/story`)。

步驟:

1. 讀取該 story 在 epic 檔中的完整章節(四類 AC + 開發邊界)與
   `docs/stories/EXX-SYYY.md` 的 EVIDENCE(若無 EVIDENCE 檔,直接列為重大缺失)。
2. 取得實際 diff(`git diff main...HEAD` 或該 story 的 PR),逐檔核對:
   - 是否落在 story 的允許修改邊界內
   - 是否觸碰禁止清單(規格庫、Team B 資料夾、contracts/ 未經同意的變更)
3. 重跑全部 gate(typecheck / lint / test / 相關 contract / security-negative /
   E2E),親自驗證 EVIDENCE 中的宣稱,不信任紙面紀錄。
4. 逐條 AC 對照:實作在哪、測試在哪、測試真的斷言了 AC 要求的行為
   (不是空殼測試)。特別檢查 Security AC 的未授權路徑。
5. 搜尋造假跡象:被 skip 的測試、放寬的 assertion、`|| true`、
   passWithNoTests、mock 被當成整合證據。
6. 產出審核報告(嚴重度排序):
   - **BLOCKER**:AC 未滿足 / 安全違規 / gate 紅 / 造假跡象
   - **MAJOR**:邊界外變更、證據缺漏、測試品質不足
   - **MINOR**:風格、殘留 debug 碼
   結論只有兩種:**APPROVE** 或 **REQUEST-CHANGES**(附逐項理由)。
