# E02 — Identity, RBAC & Authorization

---
- Owner: Team B
- Atomic stories: 34

---
## Sequencing
先 Contract/Entity → core path → permission/error → telemetry → integration/E2E。每個 Story 目標 0.5–2 developer-days；超過 2 天應再次拆分。

---
# E02-S001 — 定義 User schema 與 lifecycle

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 User schema 與 lifecycle」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S002 — 定義 Organization schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Organization schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S003 — 定義 Department schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Department schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S004 — 定義 Group schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Group schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S005 — 定義 Project membership schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Project membership schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S006 — 定義 Role schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Role schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S007 — 定義 Permission resource:action schema

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 Permission resource:action schema」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S008 — 建立 membership resolver

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 membership resolver」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S009 — 建立 local authentication endpoint

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 local authentication endpoint」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S010 — 建立 password hashing policy/implementation

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 password hashing policy/implementation」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S011 — 建立 password reset token flow

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 password reset token flow」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S012 — 建立 account disable/revoke flow

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 account disable/revoke flow」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S013 — 定義 IdentityProvider abstraction

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「定義 IdentityProvider abstraction」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S014 — 實作 OIDC adapter thin slice

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「實作 OIDC adapter thin slice」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S015 — 實作 AD/LDAP adapter contract

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「實作 AD/LDAP adapter contract」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S016 — 建立 RBAC evaluator

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 RBAC evaluator」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S017 — 建立 Resource ACL evaluator

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 Resource ACL evaluator」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S018 — 實作 Deny-Wins conflict resolver

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「實作 Deny-Wins conflict resolver」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S019 — 建立 can(user,action,resource) API

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 can(user,action,resource) API」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S020 — 建立 Knowledge authorization adapter

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 Knowledge authorization adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S021 — 建立 Document authorization adapter

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 Document authorization adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S022 — 建立 ERP authorization adapter

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 ERP authorization adapter」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S023 — 建立 Retrieval authorization scope builder

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 Retrieval authorization scope builder」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S024 — 建立 permission cache

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 permission cache」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S025 — 建立 cache invalidation/revocation

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 cache invalidation/revocation」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S026 — 建立 permission decision audit

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 permission decision audit」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S027 — 建立 authorization contract tests

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 authorization contract tests」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S028 — 建立 permission matrix tests

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 permission matrix tests」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S029 — 建立 cross-tenant/organization isolation tests

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 cross-tenant/organization isolation tests」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S030 — 建立 revoked-access regression tests

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team B
- Layer: Platform/Backend
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「建立 revoked-access regression tests」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
# E02-S031 — Contract 凍結：Session-cookie 登入／登出／current-session API（E02-S009 最小切片）

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team A（使用者 2026-08-28 指派本批 story 由 Team A 開發；domain 原屬 Team B，contract 變更仍需 domain owner review）
- Layer: Contract
- Priority: P0
- MVP: Required Thin Slice（持久化／跨視窗同步的前置：session 必須跨分頁存活）
- Story size target: 0.5 developer-day
- Story 來源: 使用者指示新增（2026-08-28）；ADR 0005
- Parallel-safe: Yes（只新增 `contracts/openapi/auth.yaml`）

## User / System Value
現在的 mock session 是記憶體變數，開第二個視窗即被踢回登入頁；跨視窗同步
與持久化都以「session 跨分頁／重整存活」為前提。本 story 把 E02-S009
「local authentication endpoint」凍結成最小 contract，形狀與既有
`@ai-km/auth-client` 的 `AuthSession`／`AuthErrorCode` 完全相容，讓前端
（E03-S035）與後端（E02-S032）平行開發。

## 技術決策（依 ADR 0005）
- `contracts/openapi/auth.yaml`（`servers: [{url: /v1}]`，`Error` `$ref`
  `core.yaml`）：
  - `POST /auth/login` body `{username(1–64), password(1–256)}` → 200
    `AuthSession` + `Set-Cookie: ai_km_session=…; HttpOnly; SameSite=Lax; Path=/[; Secure]`；
    400 `VALIDATION_ERROR`、401 `INVALID_CREDENTIALS`、403 `ACCOUNT_DISABLED`、
    503 `SERVICE_UNAVAILABLE`。
  - `POST /auth/logout` → 204 + 清除 cookie；未登入亦 204（冪等）。
  - `GET /auth/session` → 200 `AuthSession`；無有效 session → 401
    `UNAUTHENTICATED`（前端 client 映射為 `ok: null`）。
  - `AuthSession`：`userId`、`roles`(string[])、`expiresAt`(date-time)、
    `name?`、`email?`、`department?`、`group?`——逐欄等於
    `packages/auth-client/src/index.ts` 的 `AuthSession`。
  - `securitySchemes.sessionCookie`（`type: apiKey, in: cookie, name: ai_km_session`）
    供其他 spec `$ref`。
- 不定義密碼重設、OIDC、RBAC 查詢——屬 E02 既有 story。

## Scope
### In
- 上述 yaml、README 一行、型別相容檢查（`contracts/openapi/__checks__/auth.ts`：
  generated `AuthSession` 可指派給既有 `AuthSession`）。
### Out
- 實作（E02-S032）、前端接線（E03-S035）。

## Preconditions / Dependencies
### 依賴關係（平行開發用）
- 依賴 Epic：E01（既有 `AuthSession`/`AuthErrorCode` 形狀來源）。
- HARD 依賴 Story：無。
- SOFT 依賴 Story：無。
- 下游 Story：E02-S032、E03-S034、E03-S035、E04-S038（`$ref` securityScheme）。
- 檔案交集：與 E04-S038／E12-S029 各自新增不同檔；README 各加一行。
### 前置條件
- 使用者已授權編修 `contracts/`。

## Functional Acceptance Criteria
1. lint 0 error；型別相容 typecheck 通過。
2. 每個錯誤回應以 `Error` schema 定義、code 為既有 `AuthErrorCode` 或 ADR
   0003 通用 code。
3. cookie 屬性在 spec description 明文（HttpOnly/SameSite/Secure 規則）。

## Security / Authorization Acceptance
- Spec 明文：token 只存於 HttpOnly cookie，回應 body 永不含 token；
  server 只存 token 雜湊。

## Data / Contract Acceptance
- 新增檔，不改 `core.yaml`；時間 UTC。

## UX Acceptance
- N/A。

## 開發邊界（Development Boundaries）
### 允許修改
- `contracts/openapi/auth.yaml`（新增）、`contracts/openapi/README.md`、
  `contracts/openapi/__checks__/`。
### 禁止修改
- `core.yaml`、`apps/*`、`packages/*`、`services/*`、`db/*`。

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
- 不定義 refresh token、OIDC、LDAP、RBAC 查詢、密碼重設。

## Test Obligations
- Contract lint、型別相容 typecheck；其餘 N/A。

## Evidence Required Before Done
- lint／typecheck 輸出、變更檔案清單、API diff（全新增）。

## Definition of Done
- gate 綠；E03-S035 與 E02-S032 作者可只憑此檔開工。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
---
# E02-S032 — 實作 session-cookie 登入薄切片：users／sessions migration、scrypt、requireSession、dev trigger、E2E test sandbox

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team A（使用者 2026-08-28 指派本批 story 由 Team A 開發；domain 原屬 Team B，contract 變更仍需 domain owner review）
- Layer: Domain Service/API
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 1.5–2 developer-days
- Story 來源: 使用者指示新增（2026-08-28）；ADR 0005
- Parallel-safe: Yes 對 E04-S041～S044／E12-S031（各自 package）；共用
  `db/migrations/` 目錄但檔名不同

## User / System Value
提供真實可跨分頁／重整存活的登入 session，並以 `request.auth.ownerKey`
供所有 domain 做資料隔離；同時提供 E2E 用的 test sandbox，讓 264 個既有
E2E 在改接真後端後仍能平行且互不污染。

## 技術決策（依 ADR 0005）
- Package `services/identity`（`@ai-km/service-identity`）輸出
  `identityPlugin`：
  - migration `db/migrations/202608280002_identity.sql`：
    `users(id TEXT PK, username UNIQUE, password_hash, password_salt, name, email, department, group_name, roles TEXT(JSON), disabled INTEGER, created_at)`、
    `sessions(id TEXT PK, token_hash TEXT UNIQUE, user_id REFERENCES users, owner_key, created_at, last_seen_at, expires_at)`。
  - seed（migration 之外的 `seedDemoUsers()`，啟動時若 `users` 為空且
    `AI_KM_SEED_DEMO_USERS=true`（dev/test 預設 true、production 預設 false）
    才執行）：`demo-user`／`demo-maintenance`／`demo-sales`（密碼
    `demo-pass-123`，userId／roles／name／email／department／group 逐欄等於
    `packages/auth-client/src/mock.ts` 的 `ACCOUNTS`）、`disabled`（disabled=1）。
  - 密碼：`node:crypto` `scrypt`（N=2^14, r=8, p=1, 32-byte salt；避免觸及 Node 預設 32 MiB `maxmem`），
    `timingSafeEqual` 比對；登入失敗一律 401 `INVALID_CREDENTIALS`（不區分
    帳號不存在）；`disabled` → 403 `ACCOUNT_DISABLED`。
  - Session：token 32 bytes random → cookie 值 base64url；DB 存 SHA-256；
    `expires_at` = now+7d、`last_seen_at` 更新於每次驗證（閒置 >12h 視為
    過期）；`requireSession` preHandler（覆寫 E04-S039 的介面）驗證 cookie、
    設定 `request.auth = {userId, ownerKey, roles, sessionId}`；失效 → 401
    `UNAUTHENTICATED` 並清 cookie。
  - `POST /auth/logout`：刪除 session row、清 cookie、冪等。
  - Dev trigger：`AI_KM_DEV_TRIGGERS=true` 時 username `service-error` →
    503 `SERVICE_UNAVAILABLE`。
  - Test sandbox：`AI_KM_TEST_SANDBOX=true` 時每次登入 `ownerKey =
    "<userId>:sbx:<uuid>"`，並依序執行 `sandboxSeeders`
    （`registerSandboxSeeder(fn)` 由本 package 匯出；E04-S041/S042 註冊）。
    production 啟動防護由 E04-S039 config 負責，本 story 再加一道斷言。
  - 定期清理過期 session（啟動時 + 每小時）。

## Scope
### In
- 上述 plugin、migration、seed、測試；`services/identity/README.md`。
### Out
- OIDC/LDAP、密碼重設、RBAC evaluator、帳號管理 API、apps/admin 登入。

## Preconditions / Dependencies
### 依賴關係（平行開發用）
- 依賴 Epic：E02、E04（DB 基礎）。
- HARD 依賴 Story：E02-S031、E04-S039（骨架與 auth 介面）、E04-S040
  （migration runner）。
- SOFT 依賴 Story：E04-S041/S042（sandbox seeder 註冊者；本 story 以測試用
  seeder 驗證 registry）。
- 下游 Story：E03-S035（L3）、E03-S038、E04-S041～S044（L3 真實 session）、
  E12-S031（L3）。
- 檔案交集：`apps/api/src/server.ts` 註冊 `identityPlugin` 一行（與
  `conversationPlugin`／`modelGatewayPlugin` 註冊行相鄰，三方各加一行）。
### 前置條件
- E04-S039、E04-S040 已合併 main。

## Functional Acceptance Criteria
1. Given 正確帳密，When `POST /auth/login`，Then 200 body 逐欄等於既有 mock
   帳號資料（不含 token），`Set-Cookie` 具 HttpOnly/SameSite=Lax/Path=/，
   HTTPS（`x-forwarded-proto: https` 或 TLS）時含 `Secure`。
2. Given 錯密碼或不存在帳號，Then 401 `INVALID_CREDENTIALS`，回應時間差異
   不可用於區分兩者（以 scrypt 對虛擬 hash 比對保持恆定路徑）。
3. Given `disabled` 帳號，Then 403 `ACCOUNT_DISABLED`。
4. Given 有效 cookie，When `GET /auth/session`，Then 200 且 `last_seen_at`
   更新；cookie 竄改／過期／閒置 >12h → 401 且 `Set-Cookie` 清除。
5. Given `POST /auth/logout`，Then 204、session row 刪除，再用同 cookie →
   401；無 cookie 亦 204。
6. Given `AI_KM_DEV_TRIGGERS=true`，`service-error` → 503；旗標關閉時同帳號
   → 401（一般路徑）。
7. Given `AI_KM_TEST_SANDBOX=true`，同一帳號登入兩次，Then 兩個 session 的
   `ownerKey` 不同、皆以 `userId:sbx:` 開頭，且 `sandboxSeeders` 各被呼叫
   一次並帶各自 ownerKey；旗標關閉時 `ownerKey === userId` 且 seeder 不呼叫。
8. Given seed 已存在，When 重啟，Then 不重複建立使用者（冪等）。
9. 受保護 route（以測試 route 驗證）在 `requireSession` 失敗時 401 且
   handler 未執行。

## Security / Authorization Acceptance
- token 明文不落 DB／log；密碼與 hash 不進 log；`users` seed 只含示範帳號，
  production 預設不 seed。
- Authentication 與 Authorization 分離：本 story 只做前者，`roles` 原樣
  放入 `request.auth` 供後續 E02 story 使用。

## Data / Contract Acceptance
- 回應通過 `auth.yaml` contract 驗證；migration 可重複套用；`sessions` 對
  `users` 有 FK。

## UX Acceptance
- N/A（API）；錯誤訊息繁體中文，與既有 mock 文案一致（例：「此帳號已停用，
  請聯絡管理員。」）。

## 開發邊界（Development Boundaries）
### 允許修改
- `services/identity/**`（新增）、`db/migrations/202608280002_identity.sql`、
  `apps/api/src/server.ts`（註冊一行）、`apps/api/.env.example`（新 env）。
### 禁止修改
- `contracts/`、`apps/web`、`apps/admin`、`packages/*`、其他 `services/*`。
- 不得修改 `packages/auth-client` mock（前端接線屬 E03-S035）。

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
- 不做 RBAC／permission 判定（E02-S016～S019）。
- 不做多因子、密碼政策、帳號鎖定。

## Test Obligations
- Unit/route：9 條 AC；Contract：login/logout/session 每狀態碼；
  Security-negative：竄改 cookie、過期、閒置、disabled、跨 session；
  Regression：「sandbox 旗標關閉時 ownerKey 必須等於 userId」永久測試。

## Evidence Required Before Done
- 測試輸出、migration 內容、`curl` 登入→session→登出實際輸出（token 遮罩）。

## Definition of Done
- AC 全綠；EVIDENCE 記錄 401 不分帳號存在與否的理由與恆定時間路徑作法。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
- 不得把 sandbox／dev trigger 寫成 production 可達路徑。
---
# E02-S033 — 管理員帳號 seed 與最小角色守門（`requireAnyRole`）：讓 apps/admin 與 admin 讀取 API 有真實的特權身分

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team A（使用者 2026-08-28 指派；domain 原屬 Team B）
- Layer: Domain Service/API
- Priority: P0（批次 2：技術債／空殼修復）
- MVP: Required（E11-S023 未接線、apps/admin 無登入的根因之一：沒有任何管理員帳號）
- Story size target: 0.5–1 developer-day
- Story 來源: 使用者指示新增（2026-08-28，技術債批次）；ADR 0005
- Parallel-safe: Yes 對其他批次 2 story；需在 E02-S032 之後（同 package）

## User / System Value
E11-S023 的 `AdminRouteGuard` 因「系統中沒有任何管理員帳號、沒有 session
來源」而至今未接線（誠實但空殼）。本 story 提供真實的管理員 seed 帳號與
server 端最小角色守門，讓 E11-S026 能把 guard 接進 layout、E13-S019 的
admin 讀取 API 能 fail-closed 檢查角色。

## 技術決策
- `services/identity` 的 `seedDemoUsers()` 擴充（仍受 `AI_KM_SEED_DEMO_USERS`
  控制）：`demo-super`(super_administrator)、`demo-it`(it_administrator)、
  `demo-ai`(ai_administrator)、`demo-auditor`(auditor)、`demo-km`
  (knowledge_manager)、`demo-manager`(department_manager)；密碼皆
  `demo-pass-123`；name/email/department/group 為示範值（繁體中文）。
  角色字串必須來自 `@ai-km/permissions` 的 `Role` union（型別檢查）。
- `requireAnyRole(roles: Role[])` preHandler（在 `requireSession` 之後）：
  `request.auth.roles` 與 `roles` 交集非空 → 通過；`super_administrator`
  一律通過（與 `apps/admin/src/lib/admin-route-access.ts` 既有語意一致）；
  否則 403 `PERMISSION_DENIED`（不洩漏需要哪些角色）。這是 E02-S016/S019
  RBAC evaluator 的最小切片，EVIDENCE 註明「resource:action 矩陣仍屬
  E02-S007/S016」。
- 可選 env `AI_KM_SESSION_COOKIE_DOMAIN`（未設定 = host-only cookie；
  admin 與 web 部署在同 host 不同 path 時不需設定）。

## Scope
### In
- 上述 seed、`requireAnyRole`、env、測試；`services/identity/README.md`。
### Out
- 帳號管理 API、permission 矩陣、OIDC。

## Preconditions / Dependencies
### 依賴關係（平行開發用）
- 依賴 Epic：E02、E11（角色來源）。
- HARD 依賴 Story：E02-S032。
- SOFT 依賴 Story：無。
- 下游 Story：E11-S026、E13-S019、E04-S047。
- 檔案交集：`services/identity/**`（與 E02-S032 連續）。
### 前置條件
- E02-S032 已合併。

## Functional Acceptance Criteria
1. Given seed 執行，Then 6 個管理員帳號存在且各自 `roles` 正確；重複執行
   冪等；production 預設不 seed（既有 AC 沿用）。
2. Given `demo-auditor` 登入後呼叫受 `requireAnyRole(["auditor"])` 保護的
   測試 route，Then 200；`demo-user` → 403；未登入 → 401；`demo-super` →
   200（隱含通過）。
3. 403 回應 body 不含所需角色清單。
4. Given `AI_KM_SESSION_COOKIE_DOMAIN=example.internal`，Then `Set-Cookie`
   含 `Domain=example.internal`；未設定時無 `Domain` 屬性。

## Security / Authorization Acceptance
- Deny-Wins：交集為空即拒絕；角色字串大小寫敏感；不接受 client 傳入角色。
- 管理員帳號密碼與一般示範帳號相同，僅限 dev/test（production 不 seed）。

## Data / Contract Acceptance
- 不改 contract（`AuthSession.roles` 已存在）。

## UX Acceptance
- N/A。

## 開發邊界（Development Boundaries）
### 允許修改
- `services/identity/**`、`apps/api/.env.example`。
### 禁止修改
- `contracts/`、`apps/*`、`packages/*`、其他 `services/*`。

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
- 不做 permission 矩陣、不做角色管理 UI 的後端。

## Test Obligations
- Unit/route：4 條 AC；Security-negative：403/401/隱含通過；Regression：
  「交集為空仍通過」永久測試。

## Evidence Required Before Done
- 測試輸出、seed 輸出（帳號清單，密碼遮罩）。

## Definition of Done
- AC 全綠。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
---
# E02-S034 — 登入速率限制與帳號鎖定：per-username／per-IP 節流、恆定時間回應、鎖定與解鎖語意

## Metadata
- Epic: E02 — Identity, RBAC & Authorization
- Owner: Team A（使用者 2026-08-28 指派）
- Layer: Domain Service/API
- Priority: P0（第二輪技術債稽核：`POST /auth/login` 無任何節流，可被暴力破解）
- MVP: Required
- Story size target: 1 developer-day
- Story 來源: 使用者指示新增（2026-08-28，第二輪技術債稽核）；ADR 0005
- Parallel-safe: Yes；需在 E02-S032 之後（同 package）

## User / System Value
E02-S032 已用 scrypt + 恆定時間比對防禦逐次猜測的時間側信道，但沒有
任何節流——攻擊者仍可短時間內窮舉密碼。本 story補上速率限制與短期鎖定。

## 技術決策
- `services/identity` 新表 `login_attempts(id, username, ip, succeeded,
  attempted_at)`（migration `…0004_login_attempts.sql`）。
- 節流規則（進 `POST /auth/login` 前先查）：
  - per-username：15 分鐘內失敗 ≥ 5 次 → 鎖定該帳號 15 分鐘（不論
    密碼是否正確，一律回 401 `INVALID_CREDENTIALS`，**不透露已鎖定**——
    避免帳號列舉；鎖定期滿自動解除，無需人工）。
  - per-IP：15 分鐘內失敗 ≥ 20 次（跨任何帳號）→ 該 IP 全部帳號鎖定
    15 分鐘，同上不透露。
  - 成功登入清除該 username 的失敗計數（不清 IP 計數，避免單一惡意
    IP 用一個成功帳號洗掉節流）。
- `AI_KM_LOGIN_RATE_LIMIT` 可調（測試環境設極低值加速驗證，預設如上）；
  `AI_KM_DEV_TRIGGERS=true` 時提供測試 route 或直接以真實嘗試次數驅動
  （不額外開後門）。
- 舊記錄清理：啟動時 + 每小時刪除 24 小時前的 `login_attempts`。
- Telemetry：記錄 `code: LOGIN_RATE_LIMITED` 事件（metadata only：
  username 雜湊、ip、count），不記密碼。

## Scope
### In
- 上述表、節流邏輯、清理、測試、README。
### Out
- CAPTCHA、多因子、IP allowlist、admin 手動解鎖 UI（管理員可直接刪
  DB row，記錄為已知限制）。

## Preconditions / Dependencies
### 依賴關係（平行開發用）
- 依賴 Epic：E02。
- HARD 依賴 Story：E02-S032。
- SOFT 依賴 Story：無。
- 下游 Story：無。
- 檔案交集：`services/identity/**`（與 E02-S032/S033 連續）。
### 前置條件
- E02-S032 已合併。

## Functional Acceptance Criteria
1. Given 同帳號連續 5 次錯密碼（15 分鐘內），Then 第 6 次即使密碼正確
   仍回 401（不同於平常的「密碼正確即成功」），且與錯密碼的回應**位元
   相同**（body／status／時序皆不可區分）。
2. Given 鎖定期滿（測試以可注入時鐘推進），Then 正確密碼可登入。
3. Given 單一 IP 對 20 個不同帳號各錯 1 次（共 20 次），Then 第 21 次
   任何帳號（含全新帳號）皆被鎖（IP 層級）。
4. Given 帳號登入成功，Then 該帳號失敗計數歸零，但 IP 計數不變。
5. 鎖定不透露「因為鎖定」（回應與 `INVALID_CREDENTIALS` 不可區分，
   測試逐位元比對）。
6. 24 小時前記錄於清理後不存在（表大小測試）。
7. `AI_KM_LOGIN_RATE_LIMIT` 可調且測試環境用低閾值加速驗證上述 AC。

## Security / Authorization Acceptance
- 節流狀態不外洩於任何回應欄位；telemetry 不含密碼／完整 username
  （雜湊）。
- 節流查詢先於密碼比對之後、回應之前（避免時間側信道洩漏鎖定狀態——
  以「無論是否鎖定都做一次假密碼比對」確保恆定時間，記錄於 EVIDENCE）。

## Data / Contract Acceptance
- 不改 `auth.yaml`（行為變更但錯誤 code 不變，仍是既有
  `INVALID_CREDENTIALS`——刻意不新增 `ACCOUNT_LOCKED` code，避免帳號
  列舉，此為安全決策非疏漏，EVIDENCE 需記錄）。

## UX Acceptance
- 前端不需改動（既有錯誤訊息已涵蓋此情境）。

## 開發邊界（Development Boundaries）
### 允許修改
- `services/identity/**`、`db/migrations/202608280004_login_attempts.sql`、
  `apps/api/.env.example`。
### 禁止修改
- `contracts/`、`apps/web`、`apps/admin`、其他 `services/*`。

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
- 不做 CAPTCHA／多因子／IP allowlist／admin 解鎖 UI。

## Test Obligations
- Unit/route：7 條 AC；Security-negative：恆定時間／不洩漏鎖定狀態；
  Regression：「鎖定回應可被區分」永久測試。

## Evidence Required Before Done
- 測試輸出、時序比對方法說明、migration 內容。

## Definition of Done
- AC 全綠；EVIDENCE 記錄「不新增 ACCOUNT_LOCKED code」的安全理由。

## Anti-hallucination Guard
- 不得自行發明不存在的 API/table/queue/provider。
- 不確定的 dependency 必須標為 `BLOCKED/ASSUMPTION`，不可當成已存在。
- 不得以「之後補測試/之後補權限」宣告完成。
- 不得修改 Story scope 來讓測試變綠。
