# ADR 0013: 決策權全面委任技術顧問;使用者只保留付費與整合點親手驗收

Status: Accepted · 2026-09-04(使用者對技術顧問 session ai-km-3a 原話:「之後你的決定就不需要我的裁決」;
本 ADR 由顧問依該指示落地,含 CLAUDE.md「決策權」表的修改,commit 引原話。ADR 0012 是前身。)

## Context

ADR 0012(同日,使用者在協調者 session 說「如果有問題,或是開發過程卡住,以技術顧問建議為主不需要
我的裁決」)把**擋住開發**的事委給顧問,不擋的仍留給使用者。回填一輪翻出 #7–#15 九條,其中不擋事的
(#9、#12、#13、#14)依 0012 仍要等使用者;使用者隨後對顧問說了更廣的一句,把不擋事的也委出來。

## Decision

1. `CLAUDE.md`「決策權」表:契約放寬／新 endpoint／請求側收緊、新資料夾授權、真模型選型與部署目標、
   以前沒提過的功能與產品行為——全部改為**技術顧問裁決**。留給使用者的只有兩件,理由是它們本質上不可代:
   - **付費或會產生帳單的外部服務**(花錢);
   - **整合點 `@e2e` 親手驗收**(GHERKIN_WORKFLOW §5.4:任何檢查都構不到「有人看過並接受」)。
2. `docs/DECISIONS_NEEDED.md` 的收件人改為技術顧問;協調者仍照舊「加一列就繼續做」,顧問批,協調者落地。
3. 顧問裁產品行為時的基準:fail-closed、`docs/00-design.md` 的 PD 表、既有 ADR;使用者可事後 supersede。
4. 顧問轉述使用者的話**仍然不算使用者說的**——但依本表幾乎不再需要。改規則檔(CLAUDE.md、`.claude/rules/`)
   仍要使用者親口(對本 repo 任一 session)或顧問依使用者直接指示落地並在 commit 引原話。

## 本 ADR 同時裁掉的待決(DECISIONS_NEEDED #1–#4、#7–#15)

| # | 裁決 | 基準 |
|---|---|---|
| 1 | 跨部門搬文件不是重匯副作用;若需要是獨立、有稽核紀錄的顯式操作(Wave 2 後) | 使用者經轉述亦同意;PD-15、E06-S043 |
| 2 | 真模型 D2/D3(bge-m3 本機 embedding、cross-encoder 重排)以論文那次跑通為驗收通過;ADR 0009 Status 改 | 使用者經轉述亦同意 |
| 3 | I8 後端資料來源未定前不建 13、14 資料夾 | PD-19～25 只定義了行為,沒定義資料來源 |
| 4 | 15 個舊 in-progress/blocked story 由各資料夾 NEXT.md 逐一判併入 phase-2 或註銷 | — |
| 7a | scopeKey = `dept:<department.id>`,id 是 identity 的穩定鍵,**顯示名只做呈現、永不當鑰匙**;對應由 `01-identity` 單一維護,`02-authorization` 只讀 | fail-closed:名稱會改、會重複 |
| 7b | 群組是一把鑰匙:`group:<group.id>` | PD-05 RBAC + Resource ACL |
| 7c | 一個人的 allowedScopeKeys = 部門鑰匙 ∪ 群組鑰匙(授權取聯集);Deny-Wins 作用於**顯式拒絕**(ACL deny)而非授權的合併——有明確 deny 的資源即使被某把鑰匙授權也不可見 | PD-06 |
| 7d | 文件只有一個 scopeKey;搬走後原部門不再看得到(沒有「兩邊都看得到」的狀態);搬移是顯式操作(#1) | fail-closed |
| 8 | 授權協調者起草 `contracts/openapi/knowledge.yaml`(最小:upload、list、document status、delete、re-index),走 `/decide` Proposed → 顧問批 Accepted | I4 需要 |
| 9 | 文件層與知識庫層 `visibleToRoles` 取**交集**(兩層都允許才可見) | PD-06 Deny-Wins |
| 10 | `conversations.yaml` 的 `Message` 加**選填** `citations[]`(回應側新增選填欄位,對既有消費端相容),schema 對齊 generation.yaml 的 Citation;走 `/decide` | I2 最後一塊 |
| 11 | `GET /v1/health` 登記進 `core.yaml`,回應 schema 以現行實作為準(L2-EQ 從 ABSENT 變 MATCH) | 12 的 phase-1 主力端點要受契約保護 |
| 12 | 無來源時回**結構化 abstention**:回應加 `abstained: true` + `abstentionReason` enum(`NO_AUTHORISED_SOURCES`、`INSUFFICIENT_CONTEXT`),UI 以此區分,不靠字串;`generation.yaml` 走 `/decide` | PD-11 |
| 13 | `ResyncEvent.reason` 的 `SERVER_RESTART` 是**保留值**,契約 description 註明「reserved;目前無路徑送出」,實作不補 | 契約 vs 實作分歧記錄即可 |
| 14 | 部門主管管理**自己部門**群組:**I6 落地**(`02-authorization` phase-3 + `10-admin-console` phase-2),在那之前維持最嚴讀法(僅 super_administrator);場景照現況寫,I6 時走 `/feature` 改 | PD-05、07;最嚴讀法是 fail-closed |
| 15 | CLAUDE.md 加一行「採用範式模板 v1.0.0(2026-09-04)」 | 事實紀錄 |

## Consequences

- `/autopilot` 的停止條件 1(全部卡在使用者級)實質只剩「卡在花錢」與「等 `@e2e`」兩種。
- 產品層的錯誤現在由顧問承擔:每條產品裁決都要有 fail-closed 或 PD 表的依據寫在 ADR,讓使用者事後能一眼看出
  該 supersede 哪條。
- 使用者的介面縮到兩樣:每輪一段回報、整合點的 `@e2e` 場景。

## Related

ADR 0008、0009、0012;`docs/DECISIONS_NEEDED.md`;`docs/00-design.md` §6。
