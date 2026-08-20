# E04 — RAG & Conversation Intelligence

---
- Owner: Team B
- Atomic stories: 37

---
## Sequencing
先 Contract/Entity → core path → permission/error → telemetry → integration/E2E。每個 Story 目標 0.5–2 developer-days；超過 2 天應再次拆分。

---
# E04-S001 — 定義 Conversation entity

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Conversation entity」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S002 — 定義 Message entity

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Message entity」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S003 — 定義 Generation entity

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Generation entity」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S004 — 定義 Citation entity

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Citation entity」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S005 — Query normalization pipeline

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query normalization pipeline」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S006 — Intent classifier contract

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Intent classifier contract」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S007 — Entity extraction contract

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Entity extraction contract」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S008 — Time-range extraction

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Time-range extraction」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S009 — Authorization scope builder integration

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Authorization scope builder integration」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S010 — Query embedding adapter

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query embedding adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S011 — Vector retrieval adapter

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Vector retrieval adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S012 — Keyword retrieval adapter

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Keyword retrieval adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S013 — Hybrid retrieval orchestration

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Hybrid retrieval orchestration」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S014 — Retrieval result merge

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Retrieval result merge」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S015 — Chunk deduplication

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Chunk deduplication」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S016 — Basic reranking

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Basic reranking」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S017 — Context token-budget allocator

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Context token-budget allocator」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S018 — Context source-diversity rule

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Context source-diversity rule」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S019 — Prompt assembly contract

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Prompt assembly contract」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S020 — Model Gateway request adapter

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Model Gateway request adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S021 — Grounded generation policy

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Grounded generation policy」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S022 — Abstention decision

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Abstention decision」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S023 — Citation span-to-source mapping

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Citation span-to-source mapping」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S024 — Citation source validation

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Citation source validation」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S025 — Same-conversation memory builder

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Same-conversation memory builder」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S026 — Retrieval trace persistence

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Retrieval trace persistence」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S027 — RAG error taxonomy

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「RAG error taxonomy」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S028 — RAG timeout/cancellation

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「RAG timeout/cancellation」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S029 — Evaluation dataset schema

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Evaluation dataset schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S030 — Retrieval evaluation runner

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Retrieval evaluation runner」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S031 — Citation evaluation runner

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Citation evaluation runner」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S032 — Authorization leak evaluation

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Authorization leak evaluation」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S033 — forbidden-source hard gate

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「forbidden-source hard gate」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S034 — no-evidence regression suite

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「no-evidence regression suite」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S035 — RAG latency metrics

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「RAG latency metrics」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。

---
# E04-S036 — RAG end-to-end integration test

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「RAG end-to-end integration test」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

## Scope
### In
- 實作此 Story 名稱所描述的最小完整能力。
- 定義輸入、輸出、狀態、錯誤與權限行為。
- 若跨服務，先更新 `contracts/` 再實作。
- 加入必要 telemetry/audit hook。
- 加入 automated tests。

### Out
- 與本 Story 無直接關係的 UI 重構或 domain 重構。
- 未在 baseline 指定的 GA/HA/multi-tenant 進階能力。
- 以 mock 假裝 production path 已完成。

## Preconditions / Dependencies
- E02 authorization contract 對受保護資源一律有效。
- E14 audit/observability contract 可被呼叫；若尚未實作，使用 contract-compatible test double。
- 跨 Team dependency 必須有 versioned contract + mock。
- 禁止以前端隱藏、後端事後過濾取代真正 authorization。

## Functional Acceptance Criteria
1. Given 合法且具權限的輸入，When 執行此能力，Then 回傳/呈現可預期成功結果。
2. Given 缺少必要輸入，Then fail-closed，回傳明確 validation error，不產生部分 side effect。
3. Given 無權限使用者，Then 不得讀取、推導、顯示或記錄受保護內容。
4. Given dependency timeout/unavailable，Then 呈現/回傳可分類錯誤，且不把失敗誤標為成功。
5. Given 重複請求或重試可能發生，Then 不得造成未定義重複 side effect；若不適用，測試需明示。
6. 成功與失敗路徑皆具有 correlation id / structured telemetry。
7. 涉及敏感操作時必須產生 audit event；audit payload 不得包含 secret/credential/raw sensitive content。
8. MVP 可以簡化視覺或演算法，但此能力本身不可缺席。

## Security / Authorization Acceptance
- Authorization 在資料取得或敏感操作之前完成。
- Deny Wins。
- Revoked permission 不可因 stale cache 繼續有效。
- Unauthorized source 不得進入 LLM context、citation、export 或 logs。
- 所有外部輸入均做 schema validation。

## Data / Contract Acceptance
- Contract 有明確 request/response/error schema。
- 新增欄位需 backward-compatible，破壞性變更需 ADR + version bump。
- Domain entity/state 變更需 migration/compatibility plan。
- 時間欄位使用 UTC storage；ID 不依 UI display text。

## UX Acceptance
- API/domain error 使用穩定 error code；不得洩漏 stack trace、SQL、secret 或內部 credential。


## 開發邊界（Development Boundaries）

### 允許修改
- 本 Story 所屬 Domain 內，為完成 Acceptance Criteria 所必需的 implementation、test、fixture 與文件。
- 與本 Story 直接相依的 typed contract / schema；若屬跨 Domain contract，必須先依 Contract Policy 更新並取得對應 owner review。
- 為本 Story 新增最小必要 telemetry、audit hook、feature flag wiring。
- 為測試建立 deterministic fixture / fake / mock，但 mock 不得取代 production integration。

### 禁止修改
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得改變既有 authorization semantics、Deny-Wins、resource visibility 或 audit policy 來配合功能。
- 不得直接讀寫其他 Domain 的 private table、private module 或 vector schema。
- 不得讓 Frontend / BFF 直接連 Database、Vector DB、Object Storage 或 Provider credential。
- 不得以 hardcode、測試專用 bypass、admin override、fallback-to-all-data 讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。
- 不得把新的 GA 能力、HA、DR、multi-tenant、advanced ABAC 等擴張進 MVP Story，除非 Story 明確要求。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: happy path + validation + permission + error mapping。
- Contract: request/response schema。
- Integration: 至少 1 條真實 domain path。
- Regression: 對本 Story 的主要 failure mode 建永久測試。
- 若為 UI：component test + 至少一條關鍵 E2E seam。
- 若為 backend/security：negative authorization test 必須存在。

## Evidence Required Before Done
- 測試命令與結果。
- 變更檔案清單。
- API/schema diff（若有）。
- migration evidence（若有）。
- UI screenshot/interaction evidence（若為 UI）。
- audit/telemetry evidence（若適用）。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit/integration 通過。
- 無 P0/P1 security finding。
- Contract 與 implementation 一致。
- Documentation/ADR 在需要時已更新。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
---
# E04-S037 — RAG 開發前置環境就緒：硬體規格確認與地端模型準備

## Metadata
- Epic: E04 — RAG & Conversation Intelligence
- Owner: Team B
- Layer: Platform/Tooling
- Priority: P0
- MVP: Required Thin Slice（RAG 前置）
- Story size target: 0.5–2 developer-days
- Story 來源: 使用者指示新增（2026-08-20）；本 Story 為 E04 全部需要地端
  模型推論的 Story（retrieval、generation、evaluation）之硬體/模型前置，
  應在該類 Story 動工前先完成。
- Parallel-safe: Yes（不依賴任何 contract；與其他 Story 無檔案交集）

## User / System Value
在開發 RAG 系統之前，先確認開發機硬體規格是否足以承載地端模型，建立模型
的指定目錄與下載指引，讓使用者手動下載模型放入後，由自動化腳本以真實
載入與推論驗證環境就緒。不得把 RAG 本體功能（chunking／檢索／生成管線）
偷偷併入本 Story。

## 技術決策（使用者已拍板，2026-08-20）
- Runtime：llama.cpp + GGUF，透過 `node-llama-cpp`（npm，自帶 prebuilt
  binary，與 monorepo 的 Node/TS 技術棧一致，可寫 vitest 測試）。
- 模型範圍：embedding 與 LLM 兩者都驗。
  - LLM（優先）：Qwen3-4B-Instruct `Q4_K_M` GGUF（約 2.5GB）；
    替代：Qwen3-8B `Q4_K_M` GGUF（約 5GB）。兩者擇一即可。
  - Embedding：BAAI bge-m3 GGUF（約 0.7GB，llama.cpp 已支援）。
- 模型指定目錄：repo 內 `models/`（入 `.gitignore`，模型檔不進 git）。
- 參考硬體基準（2026-08-20 於開發機實測；腳本必須動態重測，不得寫死）：
  i5-11320H（8 執行緒）／32GB RAM／GTX 1650 4GB VRAM／磁碟餘 305GB。

## Scope
### In
- `tools/model-readiness/`（新 workspace）：
  - `check-specs` 腳本：動態偵測 CPU（型號／執行緒數）、RAM、GPU／VRAM、
    `models/` 所在分區可用磁碟，輸出規格報告與模型建議（依實測規格判斷
    建議 4B 或 8B、可否 GPU offload、規格不足時降級警告）。
  - `verify-models` 腳本：掃描 `models/` 下的 GGUF——embedding 模型載入
    後對固定中文句子產生向量並驗證維度與非零值；LLM 載入後對最小中文
    prompt 完成一次真實推論並驗證非空回應。輸出成功／失敗／缺檔三態報告。
  - 上述腳本的 automated tests（先寫測試）。
- `models/` 目錄 + `models/README.md`（模型名、Hugging Face 來源連結、
  預期檔名、放置路徑、驗證指令）+ `models/.gitkeep`。
- 根目錄 `.gitignore` 增列 `models/*.gguf` 與 node-llama-cpp binary 快取。
- 根目錄 workspace 設定（`pnpm-workspace.yaml`／`turbo.json`）僅限註冊
  新 workspace 的最小變更。

### Out
- RAG 本體（chunking、檢索、生成、evaluation 管線）——屬 E04 其他 Story。
- 自動下載模型大檔（下載由使用者手動執行；腳本只偵測與驗證，缺檔時
  輸出指引）。
- `apps/*`、`packages/*`、`services/*`、`db/*`、`contracts/` 一律不動。
- 以 mock 假裝 production path 已完成——L3 驗證必須以真實下載的 GGUF
  跑真實推論。

## Preconditions / Dependencies
- 無 contract 依賴（不涉及 `contracts/`；E02/E14 之依賴不適用於本
  local-tooling Story）。
- `verify-models` 的完整驗證需要使用者已手動下載模型；缺檔屬正常的
  三態之一（見 UX Acceptance），不是 BLOCKED 條件，但本 Story 在 L3
  未以真實模型通過前不得標 Done。
- 若 node-llama-cpp prebuilt binary 在目標機器無法載入（glibc／CUDA
  相容性），記錄實測錯誤並標 `BLOCKED_DEPENDENCY`，不得改用 mock 充當
  integration 證據。

## Functional Acceptance Criteria
1. Given 任意執行環境，When 執行 `check-specs`，Then 輸出 CPU 型號與
   執行緒數、總 RAM、GPU 型號與 VRAM（無 GPU 時明確顯示「未偵測到
   GPU，將以 CPU 推論」）、`models/` 分區可用空間，以及依實測規格產生
   的模型建議（含建議量化等級與是否可 GPU offload）；全部數值動態偵測，
   不得寫死。
2. Given `models/` 內存在有效的 embedding GGUF，When 執行
   `verify-models`，Then 能載入並對固定中文測試句產生 embedding 向量，
   報告維度且向量非全零。
3. Given `models/` 內存在有效的 LLM GGUF，When 執行 `verify-models`，
   Then 能載入並對最小中文 prompt 完成一次真實推論，報告非空回應與
   生成 token 數。
4. Given 兩類模型任一缺檔，When 執行 `verify-models`，Then 對缺檔類別
   輸出「缺檔 + 指向 models/README.md 的明確下載指引」，已存在的另一
   類仍照常驗證；整體 exit code 非 0（缺任一類即未就緒），且不得 crash。
5. Given 重複執行任一腳本，Then 結果冪等，不產生任何未定義 side effect。
6. `models/README.md` 載明建議模型表、Hugging Face 下載連結、預期檔名
   與放置路徑、以及驗證指令。

## Security / Authorization Acceptance
- 腳本不得將規格資訊或任何資料上傳外部服務；唯一允許的網路行為是
  node-llama-cpp 安裝期的官方 binary 下載。
- 模型檔（`*.gguf`）與 binary 快取不得可能被 commit——`.gitignore`
  規則必須以測試驗證。
- 腳本輸出與 evidence 不得含任何 secret／token（模型一律採匿名可下載
  來源，不引入需要 credential 的模型）。
- 本 Story 不涉及使用者資料與受保護資源，Deny-Wins／authorization
  boundary 不適用，但不得以本 Story 為跳板建立任何繞過既有 boundary
  的工具路徑。

## Data / Contract Acceptance
- 不新增/修改任何 `contracts/` 內容。模型檔名與目錄約定只存在於本
  Story 的文件與腳本，不構成跨組 contract；後續 RAG Story 若要沿用，
  屆時再正式立約。

## UX Acceptance
- CLI 輸出的成功／失敗／缺檔三態訊息明確可辨（繁體中文），缺檔訊息
  包含可直接照做的下一步（下載連結 + 目標路徑）。
- 規格不足以跑建議模型時（如 RAM 不足），`check-specs` 明確警告並
  降級建議，不得靜默。
- 錯誤訊息不得洩漏 stack trace 以外無關的內部路徑或環境變數內容。

## 開發邊界（Development Boundaries）

### 允許修改
- `tools/model-readiness/`（新 workspace）之 implementation、test、
  fixture 與文件。
- `models/` 目錄（README、.gitkeep）。
- 根目錄 `.gitignore`、`pnpm-workspace.yaml`、`turbo.json` 之最小必要
  變更。
- 為測試建立 deterministic fixture／fake，但 mock 不得取代真實模型的
  integration 驗證。

### 禁止修改
- `apps/*`、`packages/*`、`services/*`、`db/*`、`contracts/`。
- 不得順手重構其他 Epic、其他 Domain 或無直接關係的 shared package。
- 不得提交任何模型檔或大型二進位進 git。
- 不得以 hardcode 規格數值、跳過真實推論、或以 mock 充當 integration
  證據讓流程通過。
- 不得移除、skip、relax 既有測試或 validation gate 來宣告完成。

### Domain Ownership Boundary
- Story owner 可以修改自己 Domain 的內部 implementation。
- 跨 Domain 互動只能經由已宣告的 API / event / shared contract。
- 若需要另一 Domain 提供目前不存在的能力：停止該部分實作，記錄 `BLOCKED_DEPENDENCY`，提出最小 contract proposal；不得自行在對方 Domain 補一套影子實作。
- Shared package 僅能放真正跨 Domain、穩定且無 domain business logic 的型別、validation、logging、UI primitive 等能力。

### API / Contract Boundary
- 不得自行猜測 endpoint、request field、response field、event topic 或 error code。
- Contract 是跨組真實來源；implementation 必須符合 contract，而不是反過來偷偷修改 contract 配合程式。
- Breaking change 必須 version bump / migration strategy / consumer impact analysis。
- 新增 optional field 不得改變既有 consumer 的預設語意。
- Error 必須使用穩定 machine-readable code；不得讓 consumer 依賴 exception text。

### Database Boundary
- 只有 owning Domain 可以直接寫入自己的資料。
- 跨 Domain 查詢優先經 service/API/read model，不得做未宣告 cross-domain table join。
- Schema 變更必須有 migration。
- destructive migration 必須有 rollback/restore 或明確不可逆風險核准。
- 不得在 migration、seed、fixture 放 production secret 或真實敏感資料。
- 狀態轉移需符合 domain state machine，不得直接改欄位跳過 invariant。

### Security Boundary
- Authentication 不等於 Authorization；兩者必須分開驗證。
- Authorization 必須在 protected read/write/retrieval 之前。
- 無權限資料不得先取回再於 UI、Citation 或 response 隱藏。
- Permission revoked 後不得因 cache、conversation context 或先前 retrieval result 繼續洩漏。
- Secret、token、password、credential、raw authorization header 不得進 log/audit/prompt。
- 對外輸入視為不可信：做 schema、size、type、range 與必要 content validation。

### AI / RAG Boundary
- LLM 不具有權限判定權；authorization result 由 deterministic platform control 提供。
- LLM 不得自行決定擴大 knowledge scope。
- Retrieval 只能使用 authorization 後的 scope。
- Citation 只能引用本次允許且實際用於回答的來源。
- Evidence 不足時依 policy abstain，不得用模型常識假裝企業事實。
- Prompt injection 內容不得覆蓋 system/security/authorization policy。
- Model/provider fallback 不得把資料送往未允許的 external provider。
- RAG tuning 不得為提高 recall 犧牲 forbidden-source leak = 0 的要求。

### Frontend / UX Boundary
- UI permission hiding 只屬 UX，不可作為 security control。
- Client 不得自行推導比 server 更寬鬆的 permission。
- 不得在 client bundle 暴露 secret、provider key 或 privileged internal endpoint。
- Loading / empty / error / permission-denied 必須是不同狀態，不得把 403 當 empty data。
- Optimistic UI 若涉及 mutation，失敗時必須 rollback 或明確 reconcile。

### BFF Boundary
- BFF 可做 response composition、client-oriented shaping、session forwarding。
- BFF 不得重新實作 Domain business rule 作為第二套真實來源。
- BFF 不得繞過 Domain authorization。
- BFF 不得直接查詢 private DB/vector schema 來縮短開發時間。

### Worker / Async Boundary
- Async job 必須有明確 idempotency / retry semantics。
- Retry 不得產生重複正式 side effect。
- Poison job 必須可觀測並進入明確 failed/dead-letter 路徑。
- Worker 不得因 background execution 繞過 user/resource authorization context。
- Job 成功只能在 required side effects 全部完成後標記。

### Observability / Audit Boundary
- Telemetry 可記錄 operation metadata，不得記錄不必要的企業原文或敏感 payload。
- Audit 與 debug log 是不同用途；敏感操作的 audit 不可只靠一般 log 代替。
- 不得吞掉 error 後仍回報 success metric。
- Correlation ID 應跨 API/service/worker 傳遞。

### Testing Boundary
- Unit test 不得取代 required integration evidence。
- Mock contract test 不得取代 real adapter integration test。
- Snapshot 不得作為 authorization/security correctness 的唯一驗證。
- Negative path 至少涵蓋 validation、unauthorized/forbidden、dependency failure。
- 修 bug 時需加入能重現該 failure 的永久 regression test。
- 測試 fixture 不得建立 production 中不可能存在的 privileged shortcut。

### Failure / Fallback Boundary
- 未定義 fallback 時一律 fail closed。
- 403 不得 fallback 成 anonymous/public broader search。
- Retrieval failure 不得 fallback 成無 citation 的企業確定性回答。
- Model failure 不得靜默切換至未核准 provider。
- Connector stale/unavailable 不得把舊資料偽裝為即時資料。
- Partial success 必須使用明確 state/error，不得標為完整成功。

### Story Completion Boundary
本 Story **只能**在以下條件全部成立時標記 Done：
1. In-scope 行為完成。
2. Out-of-scope 沒有被偷偷實作或改變。
3. Contract、implementation、tests 一致。
4. Security negative path 通過。
5. Required integration evidence 存在。
6. 無未說明 skipped/disabled tests。
7. 無 `TODO` 代表本 Story 必做功能仍未完成。
8. 所有 assumption / blocker 已顯式列出。
9. Reviewer 可從 repository evidence 重現完成狀態。
10. 沒有依賴聊天上下文才能理解的重要設計決策。

## 明確非目標（Non-Goals）
- 不以本 Story 為理由進行全域架構重寫。
- 不處理沒有直接影響本 Story AC 的技術債。
- 不提前實作其他 Story（含任何 RAG 管線邏輯）。
- 不將 MVP Thin Slice 自動升級成完整 GA 能力（如模型自動下載、多機
  規格管理、模型版本管理平台——後者屬 E12）。
- 不因「順便比較方便」而擴大資料存取範圍或權限。

## Test Obligations
- Unit: 規格解析與建議邏輯、缺檔分支、報告格式、.gitignore 規則。
- Contract: N/A（無 contract）。
- Integration: `verify-models` 對使用者實際下載的 GGUF 跑真實載入與
  推論（embedding 與 LLM 各至少一次）；mock 不算。
- Regression: 對「缺檔誤報成功」與「規格寫死」兩個主要 failure mode
  建立永久測試。
- 若為 UI：N/A（CLI only）。

## Evidence Required Before Done
- 測試命令與結果（含真實模型的 integration 執行輸出）。
- `check-specs` 於目標機器的實際輸出。
- 變更檔案清單。
- API/schema diff：None。
- migration evidence：None。
- 無未解釋的 skipped tests。

## Definition of Done
- Acceptance Criteria 全部可由測試或可重現 evidence 證明。
- typecheck/lint/unit 通過；integration 以真實模型通過。
- 無 P0/P1 security finding（.gitignore 驗證通過、無資料外傳）。
- Documentation（models/README.md）已完成。
- Reviewer 能在不讀聊天紀錄的情況下理解此 Story 做了什麼、沒做什麼、
  如何驗證。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
- 不得宣稱模型已驗證而實際只跑過 mock 或只檢查了檔案存在。
