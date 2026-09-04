# ADR 0010: Wave 1 真跑驗證過的產品決策,由「暫定」升為 Accepted

Status: Accepted · 2026-09-04(技術顧問依 CLAUDE.md「決策權」段裁決;內容是既成事實的登記,不是新決策。
使用者若要推翻任一條,發 superseding ADR。)

## Context

`docs/00-design.md` §6 的 40 條「暫定產品決策」(PD-01～PD-40)是原始規格的 PRD baseline,標的是
「未被推翻即有效」。其中八條在 Wave 1(walking skeleton,2026-09-02～03)被**真的跑過**:有實作、有測試、
有反向驗證(改壞會紅),而且 I1 的 `@e2e` 引用由使用者親眼確認。這八條不再是「暫定」,是這個 repo 已經
承諾的行為;把它們留在暫定表裡,下一個 `/feature` 分流會把它們當成可以隨便推翻的假設。

範式作者的建議(2026-09-04):暫定表只做唯讀索引;真跑驗證過的那幾條現在就轉 ADR,Context 寫驗證於何時。

## Decision

以下八條自本 ADR 起為 **Accepted**;推翻任一條需 superseding ADR 並列出受影響的 phase 與場景。

| PD | 決策 | 驗證證據(可重跑) |
|---|---|---|
| PD-06 | Permission Conflict 預設 Deny Wins | `features/06-retrieval/phase-1.feature`「Deny-Wins」「empty scope returns nothing」;反向驗證:謂詞永遠放行 → `ScopeLeakError` |
| PD-07 | Retrieval 前必須完成 Authorization | `retrieve(question, scope, topK)` 收 branded `RetrievalScope`,不在內部推導(E04-S062 約束);store 以 scope 前置過濾(sqlite-vec partition key,非 JOIN 後濾,AC-V6) |
| PD-08 | 無權限資料不得送入 LLM | `assertNoScopeLeak` 兩層(store、service);`07-generation` AC3「scopeKey 永不抵達 gateway 或 provider」 |
| PD-09 | 無權限來源不得出現在 Citation | I1 場景「same question under another department never sees the other department's document」 |
| PD-10 | 企業知識回答預設需要 Citation | `assertCitationsGrounded`:捏造引用整個回應被拒(model-gateway AC-G6/G9、generation AC2) |
| PD-11 | 無足夠資料時 AI 必須 Abstain | 空 context → 422 `GENERATION_NO_CONTEXT`,generation provider 完全不被呼叫(ADR 0007;generation AC4) |
| PD-15 | 文件更新需 Reindex | 同 documentId 同 scope 重匯 = 原子替換(先刪舊 chunk),chunk 數變少不留孤兒;不同 scope 重匯拒絕(E06-S043,使用者裁示) |
| PD-28 | Model 呼叫必須經過 Model Gateway | in-process `createModelGateway().embed()/generate()` 是主路徑,HTTP 路由是同一函式薄包裝(ADR 0007);ingestion 與 retrieval 都經它 |
| PD-36 | API 採 Contract-first | 機械化:compat gate(L0)、L2-EQ(route schema = yaml)、response-shape gate、binding coverage;契約變更走 ADR + 使用者 |

## Alternatives

- 全部 40 條轉 ADR:得到 32 條空殼(無 Alternatives、無 Consequences),範式作者明確反對。
- 全部留在暫定表:已驗證的行為與未驗證的假設同一種顏色,`/feature` 分流無法區分。

## Consequences

- `docs/00-design.md` §6 這八條的「對應 ADR」欄指向本 ADR;表本身凍結不改。
- 之後任何 phase 若讓這八條之一的反向驗證不再紅,`/phase-done` 不得通過;那是行為改變,要先推翻本 ADR。
- 其餘 32 條維持暫定;升級規則見 `00-design.md` §6。

## Related

ADR 0007(gateway 形狀)、ADR 0008(範式)、ADR 0009(模型選型細化 PD-29)、`features/06-retrieval`、`features/07-generation`、
`docs/integration/i1-real-pdf-citation.feature`。
