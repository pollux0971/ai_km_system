# 02 · authorization — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填) |
| 進行中 | 無 |
| 下一個 | phase-2(**blocked**) |

## 下一個 phase 的 gate

**phase-2(從 identity 的 session 產出 `RetrievalScope`)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [ ] 整合:I2 通過(`06-retrieval` phase-2 把 `retrievalPlugin` 接進 `apps/api` composition root,
      屆時那條「scope 固定給 `dept:eng`」的暫時限制才有東西可以取代)
- [ ] 契約:**E04-S009 解除 blocked**。這是**使用者級**的裁定,不是工程取捨,因為它問的是產品行為:
      - 部門的**顯示名稱**(session 今天給的是「資訊部」「維修部」)與 store 用的**鑰匙**(`dept:*`)
        之間,對應規則是什麼?誰維護它?
      - 群組(`group_name`,今天是「一般使用者群組」這種顯示名稱)算不算一把鑰匙?
      - 一個人同時屬於部門與群組時,兩者是聯集還是交集?(Deny-Wins 在這裡長什麼樣)
      - 跨部門搬過去的文件,原部門還看不看得到?
      這四題在 `docs/DECISIONS_NEEDED.md` 之前,phase-2 一行都不能寫。

**phase-3(群組 → scopeKeys 的變更即時生效)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I6(admin 的部門／群組頁接真 API)

## Gate 未滿足時

**不可以先做的(這條最重要)**:

- **不准建過渡對應表**。任何把「資訊部」→「`dept:it`」寫死的表、map、常數陣列、
  「暫時先這樣」的 switch,都是 **E04-S062 明文禁止**的東西
  (`06-retrieval` 的 `NEXT.md` 同一條:「不要用假的 scope 對應表先接——那正是 E04-S009 裁示禁止的過渡表」)。
  理由:那張表一旦存在就會被當成規則,而它的每一列都是**沒有人裁定過**的產品決策;
  之後真的裁定下來時,沒有人會記得哪幾列是猜的。
- **不准讓 session 回傳看起來像 scope 的欄位**來「先接起來」。phase-1 的最後一個場景
  (`the identity hands over no ready-made scope keys`,tag **`@design-constraint`**)
  就是這條的守門:任何人在 `GET /v1/auth/session` 的回應裡加上
  `scopeKeys` / `allowedScopeKeys` / `scope`,那個場景會紅。
  **它紅了不是壞事,是提醒:這個變更要走 E04-S009 與 ADR,不是順手加欄位。**
  看到紅該做的是 `/feature` + ADR,**不是拿掉那條斷言**。
  E04-S009 真的落地(也就是 phase-2 開工)時,那個場景由 `/feature` 流程**改寫**成新的事實,
  **不得直接刪除**——理由與出處寫在 `FEATURE.md` 的「設計約束場景(`@design-constraint`)」段,
  以及 `phase-1.feature` 該場景正上方的註解。這是技術顧問 ai-km-3a 2026-09-04 的裁決。
- 不准放寬 `toRetrievalScope()` 讓它接受缺 principal 的輸入,「因為呼叫端還沒接上」。
  那個拒絕正是用來抓「還沒接上」的。

**可以先做的**:

- 把上面四個問題寫進 `docs/DECISIONS_NEEDED.md`(一列),然後去做別的資料夾——這是
  CLAUDE.md 決策權表的標準走法:需要使用者的事登記完就繼續,不停。
- 補一條 vitest 斷言「`RetrievalScope` 建好之後 `allowedScopeKeys` 不能再被加東西」
  (`Object.freeze` 今天就是這個行為,只是沒有測試盯著)。這是測試 agent 的工作,
  不需要 E04-S009,補完之後可以回填成 phase-1 的第十個場景。
- 把 `packages/permissions/` 的 `AuthorizationDecision` 是死型別還是預留,問 domain owner。

## 完成後

phase-2 完成即解除 `06-retrieval` phase-2 的「scope 固定給 demo 使用者的 `dept:eng`」暫時限制,
那是 I3(部門授權真的來自身分)唯一真正卡住的一塊。
