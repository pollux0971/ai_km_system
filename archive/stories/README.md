# docs/stories — Story 完成證據(Evidence)與進度

此目錄有五種檔案:

- **`PROGRESS.md`** — 進度唯一真相來源(追蹤中 story 的狀態表),
  每次狀態轉換必須即時更新並隨 commit 提交。
- **`PENDING_DECISIONS.md`** — 自主模式下累積的待使用者批示問題。
- **`EXX-SYYY.md`** — 每個 story 的完成證據,依
  `.claude/rules/STORY_WORKFLOW.md` Phase 6 建立。
  沒有 EVIDENCE 檔的 story 一律不得視為 DONE。
- **`specs/EXX-SYYY.spec.md`** — 2026-08-28 使用者增補的 44 個 story,
  每個 story 一份獨立規格文件(對應 epic 檔章節的逐字副本,含開發範圍、
  依賴 story、四類 AC、允許/禁止修改清單)。**規格權威仍是 epic 檔**;
  本目錄只是讓單一 story 開發時不必在數十萬字的 epic 檔裡捲動。索引與
  依賴摘要表見 `specs/INDEX.md`。注意 `EXX-SYYY.spec.md`(規格)與
  `EXX-SYYY.md`(證據)是不同檔案。
- **`STORY_REGISTER_PROMPT.md`** — 交給 Claude Code 開工用的註冊 prompt。

> 使用者指示新增的 story 直接寫進規格庫對應 epic 檔(使用者 2026-08-20
> 明示覆蓋規格庫唯讀規則,僅限此用途;例:E04-S037;2026-08-28 再依同一
> 規則插入 44 個 story:E01-S021～S030、E02-S031～S034、E03-S034～S046、
> E04-S038～S044/S047～S048、E11-S026、E12-S029～S031、E13-S018～S021,
> 導讀見 `docs/architecture/voice-persistence-sync-m3.md` 與
> `docs/architecture/tech-debt-audit-2026-08-28.md`,單一 story 規格副本見
> `specs/`),規格權威仍是 epic 檔,進度照常登記於 `PROGRESS.md`。

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
