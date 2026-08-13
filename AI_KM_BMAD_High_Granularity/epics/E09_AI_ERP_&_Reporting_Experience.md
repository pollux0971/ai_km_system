# E09 — AI ERP & Reporting Experience

---
- Owner: Team A
- Atomic stories: 24

---
## Sequencing
先 Contract/Entity → core path → permission/error → telemetry → integration/E2E。每個 Story 目標 0.5–2 developer-days；超過 2 天應再次拆分。

---
# E09-S001 — ERP assistant home

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「ERP assistant home」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S002 — Natural-language query composer

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Natural-language query composer」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S003 — Query scenario selector

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query scenario selector」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S004 — Clarification UI

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Clarification UI」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S005 — Query confirmation UI

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query confirmation UI」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S006 — Query loading state

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query loading state」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S007 — Text summary

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Text summary」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S008 — Result table

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Result table」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S009 — Server pagination UI

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Server pagination UI」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S010 — KPI card

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「KPI card」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S011 — Chart renderer

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Chart renderer」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S012 — Applied-filter display

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Applied-filter display」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S013 — Data freshness badge

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Data freshness badge」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S014 — Source-system badge

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Source-system badge」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S015 — Query history

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Query history」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S016 — Excel export action

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Excel export action」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S017 — Export progress

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Export progress」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S018 — Prediction scenario selector

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Prediction scenario selector」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S019 — Prediction result

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Prediction result」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S020 — Prediction disclaimer

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「Prediction disclaimer」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S021 — ERP error UX

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「ERP error UX」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S022 — permission-denied UX

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「permission-denied UX」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S023 — large-result UX

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「large-result UX」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
# E09-S024 — ERP E2E

## Metadata
- Epic: E09 — AI ERP & Reporting Experience
- Owner: Team A
- Layer: Experience/Application
- Priority: P0
- MVP: Required Thin Slice
- Story size target: 0.5–2 developer-days
- Parallel-safe: Yes, after contracts/dependencies are satisfied

## User / System Value
完成「ERP E2E」的單一可驗證能力；不得把相鄰功能、未定義平台能力或 GA 擴充偷偷併入本 Story。

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
- Loading / empty / success / validation / permission / dependency-error 狀態皆有明確呈現。\n- Keyboard/focus 基本可操作；不得只靠顏色傳達狀態。\n- API error 不直接把 stack trace 暴露給使用者。


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
