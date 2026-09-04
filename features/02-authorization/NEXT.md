# 02 · authorization — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填) |
| 進行中 | phase-2 的**測試/spec 提案(紅)**——branch `pollux0971/authz-phase2`,待協調者送
          技術顧問確認、merge。尚未進 IMPLEMENT。 |
| 下一個 | phase-2 IMPLEMENT(仍卡 I2,見下) |

## 下一個 phase 的 gate

**phase-2(從 identity 的 session 產出 `RetrievalScope`)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [ ] 整合:I2 通過(`06-retrieval` phase-2 把 `retrievalPlugin` 接進 `apps/api` composition root,
      屆時那條「scope 固定給 `dept:eng`」的暫時限制才有東西可以取代)。**2026-09-04 現況:仍是
      `todo`**(見 `06-retrieval/FEATURE.md` phase 表)——這是唯一還沒解除的 gate。
- [x] 契約:**E04-S009 已解除 blocked**(技術顧問依 ADR 0012,2026-09-04 裁定):
      1. `scopeKey` 形狀:`dept:<department.id>` / `group:<group.id>`,顯示名永遠不當鑰匙。
      2. 對應由 `01-identity` 單一維護,`02-authorization` 只讀,不建第二張表。
      3. `allowedScopeKeys` = 部門 ∪ 群組(聯集)。
      4. Deny-Wins 作用在顯式 ACL deny 上,不是「取交集」的窄化。
      5. 一份文件只有單一 `scopeKey`;搬部門後原部門即不可見。
      **但**:裁定 1 假設的 `department.id`/`group.id` 今天在 01-identity 完全不存在
      (`users` 表只有顯示名稱兩欄,repo 內無任何 id 對照表)——**這點仍未解除,見下方
      「待協調」**。裁定 4(顯式 deny)需要的型別維度上一輪只定了方向,技術顧問
      2026-09-04 已補齊**完整形狀**(`deniedScopeKeys` 必填、謂詞與 SQL 的合成規則、
      deny 來源留到 phase-3)——見 `FEATURE.md`「phase-2b 提案」段,測試 agent 已據此
      把 deny 場景從 1 條拆成 4 條(2 紅 2 綠)+ `deny.test.ts` 4 條 vitest(2 紅 2 綠)。
      這不代表 gate 已滿足:型別擴充本身仍是 IMPLEMENT 階段的工作。

**phase-3(群組 → scopeKeys 的變更即時生效)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I6(admin 的部門／群組頁接真 API)

## Gate 未滿足時(I2 仍 todo)

**不可以先做的(這條最重要,E04-S009 裁定之後依然成立)**:

- **不准建過渡對應表**。任何把「資訊部」→「`dept:it`」寫死的表、map、常數陣列、
  「暫時先這樣」的 switch,都是 **E04-S062 明文禁止**的東西
  (`06-retrieval` 的 `NEXT.md` 同一條:「不要用假的 scope 對應表先接——那正是 E04-S009 裁示禁止的過渡表」)。
  理由:那張表一旦存在就會被當成規則,而它的每一列都是**沒有人裁定過**的產品決策;
  之後真的裁定下來時,沒有人會記得哪幾列是猜的。**這條在裁定之後反而更重要**:
  phase-2 提案(紅測試,2026-09-04)發現 01-identity 今天連 `department.id` 都沒有
  ——這個缺口很誘人被「先隨便編幾個 id」的過渡表補起來,不准這樣做;缺的是
  01-identity 的真資料,不是 02-authorization 這邊猜幾個字串。
- **不准讓 session 回傳看起來像 scope 的欄位**來「先接起來」。phase-1 的最後一個場景
  (`the identity hands over no ready-made scope keys`,tag **`@design-constraint`**)
  就是這條的守門:任何人在 `GET /v1/auth/session` 的回應裡加上
  `scopeKeys` / `allowedScopeKeys` / `scope`,那個場景會紅。
  **它紅了不是壞事,是提醒:這個變更要走 E04-S009 與 ADR,不是順手加欄位。**
  E04-S009 現在已經有裁定(ADR 0012)了,但這條規則**不因此失效**——裁定要求的是
  推導**留在 server 內部**(retrieval/authorization 層),`GET /v1/auth/session` 本身
  依然不該帶 scope 形狀的欄位。真的要動這個場景,走 `/feature` 把它**改寫**成這個
  更新後的事實(見 `FEATURE.md`「這個場景會怎麼被改寫」段的具體提案),
  **不得直接刪除**。
- 不准放寬 `toRetrievalScope()` 讓它接受缺 principal 的輸入,「因為呼叫端還沒接上」。
  那個拒絕正是用來抓「還沒接上」的。

**可以先做的**:

- **I2 不影響能不能寫 phase-2 的推導函式本身**(那是純函式,不需要 `retrievalPlugin`
  真的掛進 `apps/api`)——`services/retrieval/src/authorization/` 裡的邏輯可以先寫、
  先過 vitest,I2 只影響「掛進真實 HTTP 路徑」那一步。dev agent 拿到這份提案後可以先做
  這一半。
- 01-identity 的 id 缺口(見 `FEATURE.md`「待協調」)先登記,若協調者認為要開一個對
  `01-identity` 的 `/feature` 就去開;若認為可以讓 dev agent 在 phase-2 IMPLEMENT
  時一併處理(仍在 `02-authorization` owner 範圍內讀 `01-identity` 已有的欄位、
  或請 01-identity 的 owner 加欄位),就照那條路走,不必為此另外停下整個 phase-2。
- 把 `packages/permissions/` 的 `AuthorizationDecision` 是死型別還是預留,問 domain owner。

## 完成後

phase-2 完成即解除 `06-retrieval` phase-2 的「scope 固定給 demo 使用者的 `dept:eng`」暫時限制,
那是 I3(部門授權真的來自身分)唯一真正卡住的一塊。
