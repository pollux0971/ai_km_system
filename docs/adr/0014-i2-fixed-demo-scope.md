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
| 固定值忘了移除,一路帶到 I3 | I3 的定義就是「部門授權真的來自身分」,`docs/01-roadmap.md` 的 I3 段直接寫「06-retrieval/phase-2 的暫時限制移除」——它是 I3 的驗收項之一,不是備忘 |
| 有人趁機在 retrieval 內部推導 scope | `02-authorization` 的 `@design-constraint` 場景會紅(它守的正是「不交現成 scope keys」);`retrieve()` 簽名不變 |

**這份 ADR 不授權**:在 `services/retrieval` 內部建部門 → scopeKey 的對應表(那是 E04-S062
明文禁止的);也不授權把固定值寫進 `services/*`——它只活在 `apps/api` 的 composition root。
