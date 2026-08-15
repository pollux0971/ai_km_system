# docs/stories — Story 完成證據(Evidence)與進度

此目錄有三種檔案:

- **`PROGRESS.md`** — 進度唯一真相來源(175 個 Team A story 的狀態表),
  每次狀態轉換必須即時更新並隨 commit 提交。
- **`PENDING_DECISIONS.md`** — 自主模式下累積的待使用者批示問題。
- **`EXX-SYYY.md`** — 每個 story 的完成證據,依
  `.claude/rules/STORY_WORKFLOW.md` Phase 6 建立。
  沒有 EVIDENCE 檔的 story 一律不得視為 DONE。

## 模板

```markdown
# EXX-SYYY — <story 標題>

- 狀態:DONE | BLOCKED
- Branch:story/EXX-SYYY-...
- 日期:YYYY-MM-DD

## 變更檔案
- path/to/file — 一句話說明

## Contract / Migration 差異
None(或列出)

## Gate 紀錄
| Gate | 指令 | Exit code | 關鍵測試 |
|---|---|---|---|
| typecheck | pnpm typecheck | 0 | — |
| lint | pnpm lint | 0 | — |
| unit | pnpm test | 0 | test 名稱 |
| ...(依 story 適用的 gate 增列) | | | |

## 測試修正記錄(若有)
本 story 依 TDD 先寫測試、後寫實作(STORY_WORKFLOW Phase 2)。測試內容原則
上只增不減;若 FIX 階段修正過既有測試本身(Phase 4 第 5 點的窄例外——測試
本身的技術性錯誤,不是放寬其驗證的行為),逐筆記錄:
- 修正的測試 / 修正前後差異 / 判斷「是測試錯而非實作錯」的理由
無則寫 None。

## AC 對照
| AC | 實作位置 | 測試 |
|---|---|---|

## SELF-REVIEW checklist 結果
(逐項 ✅/❌ + 說明)

## Assumptions / 計畫外事項
## Rollback
```
