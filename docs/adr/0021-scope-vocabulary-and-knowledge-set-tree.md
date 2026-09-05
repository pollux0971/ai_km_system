# ADR 0021: 授權字彙補齊四種分區,知識集是有繼承的樹——I3 的前置

Status: Accepted · 2026-09-05 · **裁決人:使用者**(原話:對這兩題都是「**按照提案書寫的**」)。

**這份 ADR 擋著 I3。** 它改的不是幾個常數,是 `RetrievalScope` 的**資料結構**。

## Context:協調者漏掉的兩件,由使用者要求對照提案時才發現

`ADR 0013` 裁決表 #7 定義了 scope key 的字彙:`dept:<department.id>` 與 `group:<group.id>`,
授權取聯集,Deny-Wins 作用於顯式拒絕。**那份裁決只看了「部門與群組」,沒有對照提案。**

對照之後兩個缺口:

1. **提案 p.2 的知識庫分區有四種**:公司知識庫(公開)、部門知識庫(公開)、
   專案知識庫(公開)、私人知識庫(可授權)。
   `apps/web/src/lib/knowledge-scopes.ts` 也早就有 `DEPARTMENT / GROUP / PROJECT / USER` 四種。
   **檢索授權的字彙比 UI 少兩種**——`RetrievalScope` 表達不出「專案」與「私人」。
2. **提案 p.5 的知識集是一棵樹,不是扁平清單**。Step02:`Amos → KS_01/02/03`,
   而 **`KS_03` 底下還有 `Nick → KS_11/12/13`**,`Cathy → KS_04/05`。
   Step03 授權 `KS_03` 給 Cathy 之後,Step04 的「RAG 查詢範圍」欄位顯示 Cathy 拿到
   **`KS_03` 與 `KS_11`**——**授權沿著樹往下繼承**。

我們的 `RetrievalScope` 是**一組扁平的 scope key 聯集**,**沒有任何地方表達子樹繼承**。

## Decision

### D1 — scope key 字彙補齊為四種,照提案的分區

| 分區(提案 p.2) | scope key |
|---|---|
| 公司知識庫(公開) | `org:<tenant.id>` |
| 部門知識庫(公開) | `dept:<department.id>`(ADR 0013 #7a 不變) |
| **專案知識庫(公開)** | `project:<project.id>` |
| **私人知識庫(可授權)** | `user:<user.id>` |

ADR 0013 #7b 的 `group:<group.id>` **保留**——群組是授權的**受體**(Step03 可以把知識集授權給
`Group1`),與分區是不同的軸。

**ADR 0013 #7a 的原則沿用到全部四種**:**id 是鑰匙,顯示名永不當鑰匙**。

### D2 — 知識集是樹,授權沿樹繼承

- 知識集有**父子關係**;授權一個節點 = 授權**它與它底下的整棵子樹**(提案 p.5 Step04 的字面行為)。
- `RetrievalScope` 因此不能只是一組 key:要嘛在**授權求解時**把子樹展開成扁平 key 集合
  (簡單、可快取、與現有 `retrieve()` 簽名相容),要嘛帶著樹走(彈性大、但每個消費端都要懂樹)。
  **協調者建議前者(展開),I3 開工時由技術顧問定案並記進該 phase 的 ADR。**

### D3 — 子樹裡的 deny 怎麼算,**是 I3 必須先回答的問題,本 ADR 不猜**

ADR 0013 #7c 定了「Deny-Wins 作用於**顯式拒絕**,而非授權的合併」。
放進樹之後多一個問題:**授權父節點、拒絕某個子節點,算不算數?**

- 若算:deny 必須跟著子樹一起展開,而且 deny 優先於任何祖先的 allow。
- 若不算:那 deny 只能下在葉節點,UI 要擋住「對子節點下 deny」。

~~**這題本 ADR 不裁**~~ —— **2026-09-05 由技術顧問裁決,見下方 D3 Accepted。**

### D3 — Accepted(2026-09-05,技術顧問 ai-km-1b;**fail-closed 方向,使用者可事後 supersede**)

| | 裁決 |
|---|---|
| (a) | **對子節點的 deny 算數** |
| (b) | **deny 沿它自己的子樹展開** |
| (c) | **deny 優先於任何祖先的 allow**(ADR 0013 #7c 的 Deny-Wins 延伸到樹) |
| (d) | 另一個選項「deny 只能下在葉節點、UI 擋」**不採** |

**(d) 被否決的理由值得留著**:把授權正確性交給 UI 是**名字比實質大的守門**
——UI 擋得住滑鼠,擋不住任何直接呼叫,而 API 是公開契約。

**資料形狀(同時定了 D2 留的那題:展開,不在查詢時走樹)**:

- scope **在每次請求建構時**,把 **allow 節點的子樹閉包**展開成扁平 key、
  **deny 節點的子樹閉包**也展開成扁平 key;
- predicate 維持 `02-authorization/phase-2b` 的 `allowed && !denied` 與 SQL 前置過濾,**不變**;
- **不跨請求快取展開結果**——樹一改,**下一個請求就生效**。
  (快取會讓「改了授權但還沒生效」變成一段沒有人看得見的窗口,那正是靜默失敗。)

**分級:嚴格級。反向驗證**:被 deny 的子節點的文件**不得出現在引用裡**,
失敗訊息要**印出該文件 id 與命中的 scope key**。

**I3 開工前不動碼**——本節只是把答案定下來,讓那個 phase 有規格可寫。

## Consequences

| 影響 | 說明 |
|---|---|
| **I3 的範圍變大** | 原本是「scope 從固定值改成依身分推導」,現在還包含四種分區的字彙與樹的展開 |
| ADR 0014 的固定值移除條件不變 | `03-conversation/phase-2` 已經讓 `ask(question, caller)` 帶身分,那條守門是活的;I3 換掉的是**推導出什麼**,不是**有沒有身分** |
| 契約可能要動 | `RetrievalScope` 是 in-process 型別,不在 `contracts/`;但若 admin 要能建/授權知識集,那是新的 endpoint(顧問級) |
| **`02-authorization/phase-2` 的既有實作不作廢** | `toRetrievalScope` 的 allowed/denied 聯集與 Deny-Wins 仍然成立,補的是**字彙**與**展開**這兩層 |

**這份 ADR 不授權**:現在就動 `services/retrieval` 的授權碼(I2 驗收進行中);
在 D3 未定之前實作任何子樹 deny 的行為。

## Related

`AI KM系統提案說明` p.2(四種分區)、p.5(Step01–04 的樹與授權);
ADR 0013 裁決表 #7a/#7b/#7c(字彙與聯集,被本 ADR 擴充而非取代);
ADR 0014(I2 的固定 scope);`docs/01-roadmap.md` 的 I3 段;
`apps/web/src/lib/knowledge-scopes.ts`(UI 早就有四種)。
