# ai-km — Claude 開發規範(每個 session 必須遵守)

本 repo 是 AI KM 企業知識管理平台的 monorepo(Team A 視角)。規格基準在
`AI_KM_BMAD_High_Granularity/`(唯讀,禁止修改)。

## 強制工作流

**任何 story 開發(實作 EXX-SYYY)必須遵守 `.claude/rules/STORY_WORKFLOW.md`
的狀態機**,不得繞過。入口:

- `/story <ID>` — 自主開發循環(INIT→PLAN→IMPLEMENT→VERIFY⇄FIX→SELF-REVIEW→EVIDENCE)
- `/story-review <ID>` — 獨立審核(只讀 + 重跑 gate,不改碼)

非 story 的雜項修改(修 CI、調 scaffold)不需走完整狀態機,但仍受下方鐵律約束。

## 鐵律(違反即停止並回報)

1. **不發明 contract**:endpoint / schema / permission 不存在 → 回報 BLOCKED,
   不猜測。`contracts/` 是唯一真相來源,改 contract 前必須先問使用者。
2. **Fail closed**:Authorization 先於 retrieval;Deny-Wins;未授權資料不進
   context/citation/export/log。
3. **前端與 BFF 不直連 DB / vector store**;只透過 `@ai-km/api-client`。
4. **不造假綠燈**:禁止 skip 測試、passWithNoTests、放寬 assertion、`|| true`。
   紅就是紅,誠實回報。
5. **Mock 不算整合證據**;mock 只用於解除平行開發阻塞。
6. **範圍紀律**:只改 story 允許清單內的檔案;Team B 資料夾
   (`apps/api`、`apps/worker-*`、`services/*`、`db/*`)與
   `AI_KM_BMAD_High_Granularity/` 一律不動。
7. **證據落檔**:story 沒有 `docs/stories/EXX-SYYY.md` 就不是 DONE。

## Team A 範圍

只實作 E01/E03/E05/E07/E09/E11/E13 的 story。依賴 Team B(E02/E04/E06/E08/
E10/E12/E14)時:對 contract 草案 + mock 開發,並在 EVIDENCE 記錄。

## 開發環境

- Node 22(`.nvmrc`)、pnpm workspace + Turborepo、TypeScript strict。
- 驗證指令:`pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test`。
- Apps:`apps/web`(:3000)、`apps/admin`(:3001),共用 `packages/*`。

## 參考順位(衝突時由高到低)

1. `AI_KM_BMAD_High_Granularity/policies/`(三份 policy)
2. `.claude/rules/STORY_WORKFLOW.md`
3. epic 檔中該 story 的開發邊界
4. 本檔其餘內容
