---
description: 驗收一個整合點(ADR 0008)。核心是把 @e2e 場景原文貼給使用者問「你做得到嗎」——測試全綠但使用者說做不到,就是沒整合完。
---

# /integrate — 整合驗收

目標:`$ARGUMENTS`(`I2`、`I3`…)

整合點的驗收比 phase 嚴格,因為它的意思是「**系統現在是完整可用的**」。

## 第一步:定位

從 `docs/01-roadmap.md` 找到該整合點的段落:「你做得到什麼」(這是驗收的真正標準)、需要的 phase 清單、
已知限制。讀 `docs/integration/<in>-*.feature`。

## 第二步:前置檢查

- roadmap 列的每個 phase 狀態都是 `done`。有未完成的,列出並停。
- **前一個整合點已通過**。沒有就停——整合不能跳。
- 該整合點的 `@e2e` 場景存在且描述「一個人從頭到尾做完一件事」。寫不出來 → 整合點切錯了,停。

## 第三步:stub 與暫時限制清除

掃每個涉及的 `FEATURE.md` 與 `NEXT.md`,找「暫時限制」「stub」「mock」標記且解除點是這個整合點的項目。
每一項用 Grep 確認已不存在。還在 → 列出,**不算整合完成**。留著 stub 的整合是假整合。
(I2 的已知限制「scope 固定 dept:eng」解除點是 I3,不在此擋。)

## 第四步:自動場景

```
pnpm --filter @ai-km/features accept -- ../docs/integration --tags "@<in> and not @manual and not @e2e"
```

分開回報三類:一般場景(這個整合點的新能力)、`@regression`(前面的整合點有沒有被弄壞——**這類失敗最嚴重**)、
`@model`(需要真模型的,問使用者要不要跑)。
`@e2e` 且非 `@manual` 的走 CI 的 Playwright job,附 run URL。

## 第五步:單獨執行全檢

**跑每一個** `standalone.json` 的非互動指令,不只這次整合涉及的。這是耦合檢測器:
如果 06 的整合讓 04 的單獨執行壞掉,代表有人偷偷加了依賴。任何一個跑不起來 → 不算整合完成。

## 第六步:契約 gate 全綠

`pnpm contract-gate`、`pnpm gherkin:dup`、CI 三個 job(lint-typecheck-unit / contract-gate / e2e)綠,附 run URL。

## 第七步:端到端場景

列出 `@e2e` 場景,**一字不改地呈現給使用者**:

```
## 這是「完整可用」的標準,請親手確認

@e2e Scenario: A person asks in the browser and opens the cited passage
  Given …
  When …
  Then …

roadmap 說 <IN> 之後你做得到:「<你做得到什麼>」

你做得到嗎?
```

**這一項不能由測試代替。** 使用者說做不到,就是沒整合完,不管測試結果如何。**等回覆。**

## 第八步:其他 @manual

列出剩下的 `@manual` 場景成 checklist,問哪些沒過。**等回覆。**

## 第九步:判定

第三到第八步全過 → 整合完成。

### 若完成

1. `docs/01-roadmap.md` 現況表:目前階段改成下一個整合點;該整合點標題後加 `✓ <日期>`
2. `docs/integration/README.md` 表格狀態更新;`features/package.json` 的 `accept:integration` tags 加入 `@<in>`
3. 掃所有 `NEXT.md`,把整合 gate 是這個整合點的 phase 打勾;列出新解鎖的 phase
4. 建議 `git tag <IN>`
5. 回報並加一句:roadmap 的「通過後立刻做」寫了什麼——**提醒使用者去做,那比繼續寫程式重要**
6. 回顧三題寫進 `docs/01-roadmap.md` 該整合點段落:哪個 gate 沒抓到東西、哪條規則多餘、哪條缺。
   整合層規則在範式來源尚未實戰(ADR 0008 §7),摩擦記下來回饋範式作者。

### 若未完成

不改任何狀態。逐項列出哪一步沒過。

## 禁止事項

- 不跳過整合點
- 不在 stub 未移除時標完成
- 不在任何單獨執行跑不起來時標完成
- 不在使用者說「做不到」時標完成,不管測試多綠
- 不修改整合的 `.feature` 讓它通過
