# Atomic Story 開發邊界總則

本文件是所有 E01–E14 Atomic Story 的共同約束。個別 Story 可以增加更嚴格限制，但不得降低本文件要求。

## Atomic Story 判定

一個 Story 原則上只能擁有一個主要 capability / behavior outcome。Story 應能在約 0.5–2 developer-days 內由單一 Developer/Agent 完成並驗證。

必須再次拆分的訊號：

- 同時新增兩個以上彼此可獨立 release 的能力。
- 同時修改多個沒有必要耦合的 Domain。
- 同時包含 schema redesign、API redesign、UI redesign 三種大型變更。
- Acceptance Criteria 無法由一組緊密相關測試證明。
- 需要 Agent 自行決定尚未定義的產品行為。
- 需要跨越未建立的 Contract 才能完成。
- 預估超過 2 developer-days。
- rollback 需要回退多個互不相關的功能。

## Scope Freeze

Developer 開始 Story 後，Story 的 In / Out / Contract / Security Boundary 視為 frozen。

發現缺漏時：
`發現 → 記錄 → 分類 → BLOCKED / 新 Story / Contract Change → Review → 再繼續`

禁止：
`發現缺漏 → Developer 自己腦補需求 → 擴大 scope → 一起 commit`

## Dependency Boundary

Dependency 分為：
- HARD：沒有它不能正確完成。
- CONTRACT：可使用 frozen contract + mock 平行開發。
- SOFT：不影響 correctness，可後續整合。

Hard dependency 未完成時不得把 Story 標 Done。

## Change Budget

每個 Story 的 code change 必須可解釋回某一條 AC、test obligation、security requirement 或必要 refactor。
無法追溯的修改應移出 Story。

## Cross-Team Rule

Team A 與 Team B 以 Contract 為交界，而不是靠口頭同步內部 implementation。
任何跨組 private implementation coupling 都視為 architecture violation。

## AI Agent Rule

AI Agent 必須把未知視為未知：
- 不知道 endpoint → 不發明。
- 不知道 schema → 不猜。
- 不知道 permission → fail closed。
- 不知道產品行為 → BLOCKED/ASSUMPTION。
- 不知道 provider capability → 查 contract/config。
- 不知道 migration impact → 不做 destructive migration。

Agent 的任務是完成 Story，不是自行重新設計產品。
