# ADR 0019: 不再區分 super 與普通 administrator——合併為單一 `administrator` 角色

Status: Accepted · 2026-09-05 ·
**裁決人:使用者(最高權威)。** 原話:「**未來就不要分 super 和普通 administrator 了**」,
於協調者 session 走查 `#17` 時直接說出;角色模型與落地時點由使用者在同一輪選定。

**本 ADR 推翻先前裁定的一部分**:ADR 0013 裁決表 #14 曾定「部門主管管自己部門群組於 I6 落地,
在那之前維持**最嚴讀法**(僅 `super_administrator`)」。最嚴讀法**在 I6 之前仍然照舊**,
但 **I6 之後的目標模型不再是「放寬最嚴讀法」,而是「沒有 super 這一層」**。

## Context:這是使用者用手撞出來的

2026-09-05,使用者依 `#17` 的走查清單以 `demo-it`(`it_administrator`)登入 admin,
**打不開部門管理與群組管理**。

系統的行為是**對的**——`apps/admin/src/lib/admin-route-access.ts` 把 `/departments`、
`/groups`、`/roles`、`/permissions` 只給 `super_administrator`。

**錯的是那條走查場景**(`10-admin-console/phase-1.feature` 的 `@e2e @manual`):
它寫「Given the admin console is running for a signed-in **IT administrator** /
When that administrator opens **部門管理, 群組管理**, 連接器管理 and 系統健康儀表板」
——要求 IT 管理員打開四頁,而授權表只讓他進兩頁。

**這條漂移沒有任何機器守著。** 它是 `@manual`,不在任何 gate 裡;
`phase-1` 的自動場景全綠、獨立驗收 PASS、反向驗證紅在角色陣列上——**沒有一項會碰到它**。
只有人真的登入、真的去點,才會發現,**而那正好是最貴的時機:使用者驗收時**。
(§5.4「任何檢查都構不到『有人看過並接受』」的反面:**任何檢查也構不到「沒人看過的地方在漂移」**。)

## Decision

### D1 — 角色模型:合併為單一 `administrator`

| 現況 | 之後 |
|---|---|
| `super_administrator`、`it_administrator`、`ai_administrator` | **合併為 `administrator`**,擁有全部管理頁面 |
| `auditor` | **保留**(不是 administrator) |
| `knowledge_manager` | **保留**(不是 administrator) |

授權表的目標形狀:

```
/users /roles /permissions /departments /groups /connectors
/settings /health /usage /latency /prompts /models  → administrator
/audit                                              → auditor, administrator
/knowledge /feedback                                → knowledge_manager, administrator
```

**使用者已知並接受的代價**(選項描述裡明寫,他選了這個):
之後**無法再說「AI 管理員只管模型與提示詞」**——`ai_administrator` 這個職責分工消失。

### D2 — 落地時點:I6,不是現在

I6 本來就是「admin 管部門與群組」,授權表在那時會重寫
(`10-admin-console/phase-2` + `02-authorization/phase-3`)。

**現在不動 RBAC**:它在鐵律 2 的範圍內,而 I2 的驗收正在進行中;
把一個授權模型變更插進 I2 與 I3 之間,會讓 I3(「部門授權真的來自身分」)的基準在做到一半時改變。

**在 I6 之前,最嚴讀法照舊**——`it_administrator` 進不去部門/群組管理是**正確行為**,不是待修缺陷。

### D3 — 現在就做的兩件

1. **修那條寫錯的 `@manual` 場景**(本 ADR 同一個 commit):改成照**實際**授權表寫,
   並且**把「誰進不去」也寫成斷言**——一條只驗「進得去」的場景,在授權表被放寬時**不會紅**。
   新場景同時驗:super 進得去四頁、IT 進得去兩頁而**被擋在另外兩頁外**。
2. 本 ADR 記錄決策,`docs/01-roadmap.md` 的 I6 段與 `10-admin-console` 的 phase 表引用它。

## Consequences

| 風險 | 擋法 |
|---|---|
| I6 落地時忘了這個決策,又照「放寬最嚴讀法」做 | roadmap I6 段與 `10-admin-console/FEATURE.md` phase-2/3 都指向本 ADR;ADR 0013 #14 的那格也註明被本 ADR 取代 |
| 合併後某個頁面被誤放給 `auditor`/`knowledge_manager` | D1 的表是目標形狀的**唯一**來源;I6 的 phase 要有反向驗證對著**角色陣列的內容**(`10-admin-console/phase-1` 已有這個形狀的守門,照抄) |
| 其他 `@manual` 場景也在漂移而沒人知道 | **這是本 ADR 最該留下的一句**:`@manual` 場景與實作的漂移**只會被人發現**。I6 之前應該有人把所有 `@manual` 場景與實際行為對一次——不是自動化它們(那會違反 §5.4 的精神),是**確認它們描述的還是現在的系統** |

**這份 ADR 不授權**:現在就改授權表;把 `auditor` 或 `knowledge_manager` 併進 `administrator`;
在 I6 之前把 `it_administrator` 的權限放寬到部門/群組。

## Related

ADR 0013 裁決表 #14(被本 ADR 在「目標模型」這一點上取代)、
`docs/DECISIONS_NEEDED.md` #14、`apps/admin/src/lib/admin-route-access.ts`、
`features/10-admin-console/`(phase-2、phase-3 掛在 I6)、GHERKIN_WORKFLOW §5.4。

---

## 2026-09-05 追加確認:群組範圍的管理員「暫時」不做

協調者對照提案 p.5 後回報一個張力:提案的角色是
**`Alex(System Admin)`、`Amos(Admin of Group1)`、`Nick(Admin of Group2)`、其餘 User of GroupN**
——也就是「系統管理員」與**群組範圍的管理員**兩層,而後者正是 I6(admin 管部門與群組)
與 `DECISIONS_NEEDED` #14 的內容。

使用者裁決(原話):「**暫時只用一個 administrator**」。

**所以本 ADR 的 D1 範圍確認為**:合併 `super_administrator` / `it_administrator` /
`ai_administrator` 為單一 `administrator`;**「只能管自己那個群組的管理員」暫時不做**。

**「暫時」兩個字要留著,不要讀成「永不」**:提案 p.5 的 `Amos`/`Nick` 角色在那份文件裡是成立的,
而 I6 的定義就是「admin 管部門與群組」。這條裁決是**現在不做**,不是**提案錯了**。
I6 開工時要重新問一次;`DECISIONS_NEEDED` #14 因此**不關閉**,改標為「暫緩,見 ADR 0019 追加段」。
