# ai-km — Claude 開發規範(每個 session 必須遵守)

本 repo 是 AI KM 企業知識管理平台的 monorepo(Team A 視角)。規格基準在
`AI_KM_BMAD_High_Granularity/`(唯讀,禁止修改)。

## 強制工作流

**任何 story 開發(實作 EXX-SYYY)必須遵守 `.claude/rules/STORY_WORKFLOW.md`
的狀態機**,不得繞過。入口:

- `/story <ID>` — 自主開發循環(INIT→PLAN→IMPLEMENT→VERIFY⇄FIX→SELF-REVIEW→EVIDENCE)
- `/story-review <ID>` — 獨立審核(只讀 + 重跑 gate,不改碼)
- `/keep-working-till-end [N]` — 自主連續開發(story→review→merge 循環),
  直到剩餘工作全部需要 Team B 或達 N 個 story
- `/advisor <問題>` — 不確定時的最優解分析(先查規格權威,必要時才問使用者)
- `/progress` — 唯讀進度回報

**進度追蹤**:`docs/stories/PROGRESS.md` 是進度唯一真相來源。任何 story 狀態
轉換都必須即時更新該檔;session 開始接手開發工作時先讀它還原進度,不憑記憶。
待使用者批示的問題累積在 `docs/stories/PENDING_DECISIONS.md`。

非 story 的雜項修改(修 CI、調 scaffold)不需走完整狀態機,但仍受下方鐵律約束。

## 鐵律(違反即停止並回報)

1. **不發明 contract**:endpoint / schema / permission 不存在 → 回報 BLOCKED,
   不猜測。`contracts/` 是唯一真相來源,改 contract 前必須先問使用者。
   (例外:使用者 2026-08-28 已批准的 contract story——E02-S031、E04-S038、
   E12-S029、E13-S018——可依其 story 規格新增對應 yaml;其他 story 仍不得
   改 contract。)
2. **Fail closed**:Authorization 先於 retrieval;Deny-Wins;未授權資料不進
   context/citation/export/log。
3. **前端與 BFF 不直連 DB / vector store**;只透過 `@ai-km/api-client`。
4. **不造假綠燈**:禁止 skip 測試、passWithNoTests、放寬 assertion、`|| true`。
   紅就是紅,誠實回報。
5. **Mock 不算整合證據**;mock 只用於解除平行開發阻塞。
6. **範圍紀律**:只改 story 允許清單內的檔案;Team B 資料夾
   (`apps/api`、`apps/worker-*`、`services/*`、`db/*`)與
   `AI_KM_BMAD_High_Granularity/` 一律不動。
   (例外:使用者 2026-08-28 明示授權並指派 Team A 開發的增補 story——
   E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021——可在**該 story 允許修改清單內**修改 `apps/api`、`services/*`、
   `db/*`、`infra/*`;導讀見 `docs/architecture/voice-persistence-sync-m3.md`
   與 `docs/architecture/tech-debt-audit-2026-08-28.md`。)
7. **證據落檔**:story 沒有 `docs/stories/EXX-SYYY.md` 就不是 DONE。

## Team A 範圍

只實作 E01/E03/E05/E07/E09/E11/E13 的 story。依賴 Team B(E02/E04/E06/E08/
E10/E12/E14)時:對 contract 草案 + mock 開發,並在 EVIDENCE 記錄。
**2026-08-28 起 Team A 另負責使用者增補並指派的 40 個 story**:E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021
(含落在 Team B epic 的 E02/E04/E12 story,domain 仍屬 Team B,contract 變更
需 domain owner review)。E04-S037 維持 Team B。全部走完整狀態機,進度登記於
PROGRESS.md 各 epic 章節。

## 開發環境

- Node 22(`.nvmrc`)、pnpm workspace + Turborepo、TypeScript strict。
- 驗證指令:`pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test`。
- Apps:`apps/web`(:3000)、`apps/admin`(:3001),共用 `packages/*`。

## 參考順位(衝突時由高到低)

1. `AI_KM_BMAD_High_Granularity/policies/`(三份 policy)
2. `.claude/rules/STORY_WORKFLOW.md`
3. epic 檔中該 story 的開發邊界
4. 本檔其餘內容
