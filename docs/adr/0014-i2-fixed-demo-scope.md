# ADR 0014: I2 期間 composition root 用 demo 使用者的固定 scope

Status: Accepted(2026-09-04,依 ADR 0012 由技術顧問裁決範圍內;形狀早已寫在
`features/06-retrieval/NEXT.md` 與 `docs/01-roadmap.md` 的 I2 段)

## Context

`06-retrieval/phase-2`(把 retrieval 接進 `apps/api` 的 composition root)是 I2 的第一塊,
而 I2 是這個系統**第一次對使用者有價值**的狀態:在 web 上登入、問一個關於已索引文件的問題、
讀到答案、點引用打開原文。

它的 gate 有兩條:

1. **E06-S043「跨部門重匯 = 拒絕」的裁定** —— 使用者 2026-09-03 已批(「我都批准了」),
   見 `docs/DECISIONS_NEEDED.md` 已批示表。**這條早就滿足了,`NEXT.md` 的核取方塊是舊的**;
   本 ADR 一併更正。
2. **`02-authorization` 能產出一個真的 `RetrievalScope`** —— **今天做不到**。
   E04-S009 的五條裁定已由技術顧問給出(ADR 0012 授權),但 phase-2a 發現
   `01-identity` **根本沒有 department id 欄位**(只有顯示名),`RetrievalScope` 也**沒有欄位
   承接顯式 deny**。2a/2b 正在做,還沒綠。

問題:要不要為了等 2a/2b 而擋住整個 I2?

## Decision

**不擋。I2 期間,`apps/api` 的 composition root 用 demo 使用者的 session 固定給
`dept:eng` 這個 scope**,並且:

- 這個固定值**只在 composition root 那一層**,`retrieve()` 的簽名不變——它仍然收一個
  branded `RetrievalScope` 當輸入,**不在內部推導、不建過渡對應表**(E04-S062 的設計約束,
  以及 `02-authorization` 那條 `@design-constraint` 場景守的東西,兩者都不放寬)。
- **場景要明寫這是 I2 的暫時限制**,不得寫成「授權已經可以用了」。
- 2a/2b 落地後,這個固定值換成從 session 推導出來的真 scope,而**換掉它應該讓某條場景紅**
  ——那條場景就是它自己的移除條件。

## Consequences

**容易了什麼**:I2 的五塊(06/07/03/11/05 的 phase-2)可以並行推進,不必排在 2a/2b 後面。
I2 通過之後使用者才第一次能拿自己的文件問問題,而那份「答非所問」的紀錄是 E04-S037
(真模型)的第一份需求——比繼續寫程式重要。

**難了什麼,以及怎麼擋**:

| 風險 | 擋法 |
|---|---|
| 固定 scope 被當成「授權做完了」 | 場景明寫暫時限制;`06-retrieval/NEXT.md` 的 phase-3 gate 引用本 ADR |
| 固定值忘了移除,一路帶到 I3 | I3 的定義就是「部門授權真的來自身分」,`docs/01-roadmap.md` 的 I3 段直接寫「06-retrieval/phase-2 的暫時限制移除」——它是 I3 的驗收項之一,不是備忘。**⚠️ 2026-09-04 更正:本欄原本還指望 `06-retrieval/phase-2.feature` 場景 4(自稱「這個固定值的移除條件」)在換掉固定值時會變紅——那個機制目前不成立,見下方「這份 ADR 的一個空保證」** |
| 有人趁機在 retrieval 內部推導 scope | `02-authorization` 的 `@design-constraint` 場景會紅(它守的正是「不交現成 scope keys」);`retrieve()` 簽名不變 |

**這份 ADR 不授權**:在 `services/retrieval` 內部建部門 → scopeKey 的對應表(那是 E04-S062
明文禁止的);也不授權把固定值寫進 `services/*`——它只活在 `apps/api` 的 composition root。

## 這份 ADR 的一個空保證(2026-09-04,由 06-retrieval/phase-2 的獨立驗收 session 發現)

上面 Consequences 表原本指望一個機械保證:`06-retrieval/phase-2.feature` 的場景 4
(「I2's scope is fixed to dept:eng for every signed-in person … this scenario is the
fixed value's removal condition」)會在有人換掉固定值時變紅。

**那個保證是空的。** 固定值今天寫在 `features/steps/retrieval.steps.ts` 的
`askThroughRealSeam()` 裡:

```ts
const scope = toRetrievalScope({ principalId, allowedScopeKeys: ["dept:eng"] });
```

不論 `principalId` 是誰都寫死 `dept:eng`,而且它**繞過任何生產碼路徑**直接呼叫
`app.retrieval.retrieve()`——因為 `apps/api` 今天沒有任何 route 會呼叫 `retrieve()`
(`server.ts` 的註解自己也承認這件事)。`RetrievalService.retrieve()` 是確定性函式,
所以「兩個人得到相同結果」這條斷言**對生產碼的任何未來改動都不會變化**,除非有人
同時手動改那個 step 檔。

也就是說:ADR 0014 說的「composition root 把固定值 hand 給每個人」這件事,**今天完全
不存在於生產碼**。這不是 phase-2 做錯——phase-2 的範圍確實只到「把 plugin 接上」,
scope 推導留給後面的 phase。錯的是**這份 ADR 對那條場景的期待**。

**修正的落點,不是備忘:** 真正的呼叫點會在 `07-generation/phase-2`(`answer()` 從
`app.retrieval` 拿 hits)出現。那一輪**必須**把固定值從 step 檔搬進 `apps/api` 的
composition root,並把場景 4 重新指向那個生產路徑;做完之前,場景 4 不得被當成移除條件。
這條寫進 `features/07-generation/NEXT.md` 的 phase-2 gate。

**這件事本身是 GHERKIN_WORKFLOW §5.2 的同一個教訓的變形**:一個從未被證明會紅的守門
不算守門。這裡更隱蔽——它**會**紅,只是紅不紅與它宣稱要守的東西無關。
