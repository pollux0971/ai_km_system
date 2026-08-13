# docs/stories — Story 完成證據(Evidence)

每個 atomic story 完成(或 BLOCKED)時,依
`.claude/rules/STORY_WORKFLOW.md` Phase 6 在此目錄建立 `EXX-SYYY.md`。
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

## AC 對照
| AC | 實作位置 | 測試 |
|---|---|---|

## SELF-REVIEW checklist 結果
(逐項 ✅/❌ + 說明)

## Assumptions / 計畫外事項
## Rollback
```
