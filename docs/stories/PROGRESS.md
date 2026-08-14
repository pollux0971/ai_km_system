# Team A Progress Tracker

**本檔是 story 進度的唯一真相來源**(見 `.claude/rules/STORY_WORKFLOW.md` 全域規則)。
任何狀態轉換(開工/完成/審核通過/卡住)都必須即時更新此檔,並隨該 story 的
commit 一起提交。

## 狀態定義

| 狀態 | 意義 |
|---|---|
| `todo` | 未開工 |
| `in-progress` | 開發循環進行中(含中斷待續) |
| `done` | `/story` 開發循環完成,EVIDENCE 已落檔,待審核 |
| `approved` | `/story-review` 審核通過,已 merge 回 main |
| `blocked` | 卡住,等使用者決策或問題排除(備註欄寫明原因) |
| `blocked-team-b` | 需要 Team B 的 contract/服務才能繼續(備註欄寫明需要什麼) |

## 開發順序

使用者指定 > 垂直切片(E01 → E03 優先)> 其餘依 E05 → E07 → E09 → E11 → E13,
epic 內依 story 編號序。依賴 Team B 的部分以 contract 草案 + mock 先行;
mock 也做不了才標 `blocked-team-b`。

## 總覽

| Epic | Stories | approved | done | in-progress | blocked* | todo |
|---|---|---|---|---|---|---|
| E01 Application Shell & User Workspace | 20 | 20 | 0 | 0 | 0 | 0 |
| E03 AI Conversation Experience | 33 | 33 | 0 | 0 | 0 | 0 |
| E05 Knowledge Management Experience | 31 | 14 | 1 | 0 | 0 | 16 |
| E07 Maintenance Assistant Experience | 25 | 0 | 0 | 0 | 0 | 25 |
| E09 AI ERP & Reporting Experience | 24 | 0 | 0 | 0 | 0 | 24 |
| E11 Admin Console | 25 | 0 | 0 | 0 | 0 | 25 |
| E13 Feedback & Analytics | 17 | 0 | 0 | 0 | 0 | 17 |
| **合計** | **175** | 67 | 1 | 0 | 0 | 107 |

> 總覽表在每次狀態轉換時一併更新。

## E01 Application Shell & User Workspace(20)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E01-S001 | approved | story/E01-S001-app-bootstrap-route-skeleton | [E01-S001.md](E01-S001.md) | 獨立審核 APPROVE(gate 全綠、範圍未逾界、無造假跡象) |
| E01-S002 | approved | story/E01-S002-login-page-local-sso | [E01-S002.md](E01-S002.md) | 獨立審核 APPROVE(gate 全綠、範圍未逾界、無造假跡象;mock 邊界內限制已誠實記錄) |
| E01-S003 | approved | story/E01-S003-login-return-url-redirect | [E01-S003.md](E01-S003.md) | 獨立審核 APPROVE(gate 一次全綠、無 FIX 循環;open-redirect 防護 16 個 adversarial 測試複驗通過) |
| E01-S004 | approved | story/E01-S004-session-bootstrap-current-user | [E01-S004.md](E01-S004.md) | 獨立審核 APPROVE(gate 全綠;含完整 protected-route→login→returnUrl round-trip E2E) |
| E01-S005 | approved | story/E01-S005-sidebar-header-main-usermenu | [E01-S005.md](E01-S005.md) | 獨立審核 APPROVE(gate 全綠;E2E 驗證登出真的清除 session,非只是換頁) |
| E01-S006 | approved | story/E01-S006-permission-aware-navigation | [E01-S006.md](E01-S006.md) | 獨立審核 APPROVE(gate 全綠;角色對應直接引自 SOURCE_BASELINE §7,UX-only 限制已誠實記錄) |
| E01-S007 | approved | story/E01-S007-home-dashboard-thin-slice | [E01-S007.md](E01-S007.md) | 獨立審核 APPROVE(gate 全綠;含明確 --frozen-lockfile 複驗) |
| E01-S008 | approved | story/E01-S008-recent-conversations-widget | [E01-S008.md](E01-S008.md) | 獨立審核 APPROVE(gate 全綠,含 --frozen-lockfile 複驗) |
| E01-S009 | approved | story/E01-S009-quick-entry-cards | [E01-S009.md](E01-S009.md) | 獨立審核 APPROVE(gate 全綠;既有測試的 FIX 已核對未放寬斷言) |
| E01-S010 | approved | story/E01-S010-user-profile-view | [E01-S010.md](E01-S010.md) | 獨立審核 APPROVE(force 重跑全 repo typecheck 驗證 AuthSession 擴充零破壞) |
| E01-S011 | approved | story/E01-S011-unified-loading-skeleton-pattern | [E01-S011.md](E01-S011.md) | 獨立審核 APPROVE(retrofit 未改變既有測試斷言,gate 全綠) |
| E01-S012 | approved | story/E01-S012-unified-error-presentation | [E01-S012.md](E01-S012.md) | 獨立審核 APPROVE(retrofit 未改變既有測試斷言,gate 全綠) |
| E01-S013 | approved | story/E01-S013-unified-empty-state-pattern | [E01-S013.md](E01-S013.md) | 獨立審核 APPROVE(retrofit 未改變既有測試斷言,gate 全綠) |
| E01-S014 | approved | story/E01-S014-notification-center-thin-slice | [E01-S014.md](E01-S014.md) | 獨立審核 APPROVE(既有測試修改僅新增斷言,gate 全綠) |
| E01-S015 | approved | story/E01-S015-feature-flag-visibility-guard | [E01-S015.md](E01-S015.md) | 獨立審核 APPROVE(SSO 區塊內容位元級不變,只是加上條件包裝) |
| E01-S016 | approved | story/E01-S016-desktop-responsive-baseline | [E01-S016.md](E01-S016.md) | 獨立審核 APPROVE(fresh gate 全綠,無 lockfile drift,scope 未逾界) |
| E01-S017 | approved | story/E01-S017-route-level-guards | [E01-S017.md](E01-S017.md) | 獨立審核 APPROVE(fresh gate 全綠,無 lockfile drift,scope 未逾界) |
| E01-S018 | approved | story/E01-S018-app-level-error-boundary | [E01-S018.md](E01-S018.md) | 獨立審核 APPROVE(2 輪 FIX 後 fresh gate 全綠,補上 global-error.tsx 的 CSS import) |
| E01-S019 | approved | story/E01-S019-frontend-telemetry-hooks | [E01-S019.md](E01-S019.md) | 獨立審核 APPROVE(fresh gate 全綠,無 lockfile drift,scope 未逾界) |
| E01-S020 | approved | story/E01-S020-e01-e2e-smoke-flow | [E01-S020.md](E01-S020.md) | 獨立審核 APPROVE(fresh gate 連兩輪全綠,無 flaky,scope 未逾界)——**E01 epic 全數 20/20 approved** |

## E03 AI Conversation Experience(33)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E03-S001 | approved | story/E03-S001-conversation-list-new-route | [E03-S001.md](E03-S001.md) | 獨立審核 APPROVE(fresh gate 全綠,E2E 連跑 3 輪確認無 flaky,scope 未逾界) |
| E03-S002 | approved | story/E03-S002-normal-advanced-mode-switch | [E03-S002.md](E03-S002.md) | 獨立審核 APPROVE(fresh gate 全綠,E2E 連跑 2 輪無 flaky,scope 未逾界) |
| E03-S003 | approved | story/E03-S003-knowledge-selector-single-select | [E03-S003.md](E03-S003.md) | 獨立審核 APPROVE(fresh gate 全綠,E2E 連跑 2 輪無 flaky,scope 未逾界) |
| E03-S004 | approved | story/E03-S004-knowledge-selector-multi-select | [E03-S004.md](E03-S004.md) | 獨立審核 APPROVE(fresh gate 全綠,E2E 連跑 2 輪無 flaky,scope 未逾界) |
| E03-S005 | approved | story/E03-S005-advanced-model-selector | [E03-S005.md](E03-S005.md) | 獨立審核 APPROVE(fresh gate 全綠,E2E 隔離+全量各跑一輪無 flaky,scope 未逾界) |
| E03-S006 | approved | story/E03-S006-message-composer-baseline | [E03-S006.md](E03-S006.md) | 獨立審核 APPROVE(fresh gate 全綠,build/test 分開跑,scope 未逾界;1 個 MINOR 測試命名精確度建議,不阻擋) |
| E03-S007 | approved | story/E03-S007-multiline-keyboard-behavior | [E03-S007.md](E03-S007.md) | 獨立審核 APPROVE(fresh gate 全綠,build/test 分開跑,scope 未逾界;獨立覆核原生換行行為推理無誤) |
| E03-S008 | approved | story/E03-S008-file-attachment-picker | [E03-S008.md](E03-S008.md) | 獨立審核第 1 輪 REQUEST-CHANGES(@ai-km/e2e#typecheck 紅,缺 @types/node)→ 修復 → 第 2 輪 fresh gate 全綠 APPROVE |
| E03-S009 | approved | story/E03-S009-send-message-optimistic-state | [E03-S009.md](E03-S009.md) | 獨立審核 APPROVE(fresh gate 全綠,scope 未逾界;獨立覆核樂觀收斂競態、重試防護、correlationId 獨立性皆正確) |
| E03-S010 | approved | story/E03-S010-sse-websocket-streaming-renderer | [E03-S010.md](E03-S010.md) | 獨立審核 APPROVE(fresh gate 全綠,scope 未逾界含對 S11-S14/S21 不越界的獨立核對;獨立追蹤並行串流/型別窄化修正無誤;1 個 MINOR UX 觀察不阻擋) |
| E03-S011 | approved | story/E03-S011-generation-status-ui | [E03-S011.md](E03-S011.md) | 獨立審核 APPROVE(從正確 root 重跑 gate 全綠,scope 未逾界;直接重讀程式碼獨立覆核兩個關鍵設計修正真實落實,非紙上聲稱) |
| E03-S012 | approved | story/E03-S012-stop-generation-interaction | [E03-S012.md](E03-S012.md) | 獨立審核 APPROVE(從正確 root 重跑 gate 全綠,scope 未逾界;獨立追蹤停止機制的多個邊界情況皆無誤) |
| E03-S013 | approved | story/E03-S013-citation-badge-rendering | [E03-S013.md](E03-S013.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 234 unit+66 E2E 全過,scope/AC 對照/fakery 掃描皆通過;獨立覆核 stop-generation.spec.ts 修正的技術主張,判定非 scope creep) |
| E03-S014 | approved | story/E03-S014-citation-preview-drawer | [E03-S014.md](E03-S014.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 251 unit+68 E2E 全過;獨立覆核 S013 迴歸風險為零、NOT_FOUND 設計與 noUncheckedIndexedAccess 修正皆對照原始碼屬實) |
| E03-S015 | approved | story/E03-S015-citation-open-source | [E03-S015.md](E03-S015.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 259 unit+69 E2E 全過;獨立追溯 page.goto/mock session 消失的技術主張至原始碼並用既有測試實證,判定推理成立) |
| E03-S016 | approved | story/E03-S016-citation-permission-error | [E03-S016.md](E03-S016.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 267 unit+69 E2E 全過;獨立深入核對 BLOCKED-vs-mock 判斷——確認 FORBIDDEN 機制與 role/session/user 完全無耦合,非影子授權實作,與 S13-S15 既有先例一致) |
| E03-S017 | approved | story/E03-S017-multi-turn-conversation | [E03-S017.md](E03-S017.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 278 unit+71 E2E 全過,額外對最高風險測試連續壓力測試 25 次皆過;獨立判斷送出鎖定屬合理、揭露充分的裁量性 UX 強化,非發明限制;1 個 MINOR 註解過度宣稱已修正) |
| E03-S018 | approved | story/E03-S018-conversation-context-indicator | [E03-S018.md](E03-S018.md) | 獨立審核 APPROVE(2 次 force 全量重跑皆 288 unit+73 E2E 全過;獨立驗證「indicator」措辭判斷有據且與 S17 既有顧慮呼應,非揀易而為;1 個 MINOR 重複空狀態文案已修正並重新驗證) |
| E03-S019 | approved | story/E03-S019-regenerate-answer-action | [E03-S019.md](E03-S019.md) | 獨立審核 APPROVE(重新產生回覆動作:deleteMessage 避免重複、只作用於最後一則;順帶修正高負載下復發的既有 flaky E2E stop-generation.spec.ts,已證實非本 story 造成);1 個 MINOR(force:true 註解誇大其粒度)已修正並以 2 次 force 全量重跑(13/13 tasks、75/75 E2E)重新驗證 |
| E03-S020 | approved | story/E03-S020-answer-revision | [E03-S020.md](E03-S020.md) | 獨立審核 APPROVE(Answer Revision,SOURCE_BASELINE「需留下 Revision」:把 S19 的 deleteMessage 刪除＋新增機制改為 reviseMessage 原地更新＋保留舊內容,新增「先前版本」history UI;連帶讓 regenerate 途中空內容停止時舊回覆不再遺失;0 次 FIX 循環,gate 一次全綠;獨立重跑 typecheck/lint/build/302 unit/7 個目標 E2E 皆綠,逐項核對機制/UI/listitem 隔離/停止行為/scope/AC 對照後確認無誤)；1 個 MINOR(revisions 列表用 index 當 React key)經獨立審核判定安全、非缺陷,無需修正 |
| E03-S021 | approved | story/E03-S021-answer-state-rendering | [E03-S021.md](E03-S021.md) | 獨立審核 APPROVE(Answer State Rendering,SOURCE_BASELINE 列舉 6 個狀態:/advisor 引用 SOURCE_BASELINE §5 #32/#35 + readme_zh.md 授權建立誠實 mock trigger(`[模擬:XXX]`)分類機制,而非發明假 RAG/authorization;PARTIAL 保留正常串流,其餘 4 態以固定佔位句取代;過程中自行發現並修正 role="status" 與 waitForThreadToSettle 衝突、role="alert" 無 name-from-content 兩個問題;0 次正式 FIX 循環;獨立重跑 typecheck/lint/build/329 unit/10 個目標 E2E 皆綠,逐項核對 /advisor 依據、mock 機制、5 個既有測試修正皆屬機械性變更後確認無誤)；2 個 MINOR(既有測試修正計數誤植為 4、mock trigger 比對機制與既有精確比對先例的類別差異說明)皆為證據文件精確度問題,已修正計數/歸屬,無需改動程式碼 |
| E03-S022 | approved | story/E03-S022-conversation-history-pagination | [E03-S022.md](E03-S022.md) | 獨立審核 APPROVE(Conversation History Pagination,epic 展開標題:listConversations 改回傳分頁物件,固定 pageSize=2 讓既有 3 筆種子資料集本身即跨兩頁;1 次 FIX 循環,既有 model-selector/conversation-detail E2E 因種子對話換頁而變紅,已修復並從 typecheck 重新跑完整序列;獨立以全 repo grep 逐項核對 breaking-change 消費端範圍、4 處跨 story E2E 修正皆為純新增無鬆綁斷言、pagination 數學邊界皆正確)；1 個 MINOR(超出範圍頁碼測試未一併斷言 totalCount/totalPages)已加強測試;1 個 MINOR(既有 Node 版本不符,與本 story 無關)無需處理 |
| E03-S023 | approved | story/E03-S023-conversation-search | [E03-S023.md](E03-S023.md) | 獨立審核 APPROVE(Conversation Search:listConversations 新增 optional query 參數,先過濾再分頁;只比對 title;吸取 S022 教訓,實作前主動驗證跨 story E2E 迴歸風險,0 次 FIX 循環一次全綠;獨立以全 repo grep 確認唯一消費端、重跑 3 個曾受 S022 影響的既有 E2E 皆過、test-pollution 安全性逐字元核對皆屬實)；2 個 MINOR(.toLocaleLowerCase() 註解誇大實際差異、空白查詢在 UI 與資料層 trim 不一致的潛在缺陷)皆已修正 |
| E03-S024 | approved | story/E03-S024-rename-conversation | [E03-S024.md](E03-S024.md) | 獨立審核 APPROVE(Rename Conversation:renameConversation 新增於 lib,trim 後為空 → VALIDATION_ERROR(UI 停用按鈕雙重防護,獨立驗證資料層繞過 UI 直呼仍正確擋下);RenameConversation 元件整個接管標題區塊(顯示/編輯雙態);0 次 FIX 循環;獨立重跑 typecheck/lint/build/366 unit/21 個目標 E2E 皆綠,逐項核對驗證邏輯、狀態機、wiring、scope 皆屬實)；3 個 MINOR 皆經審核明確判定不影響功能、無需修正,其中 1 個(測試未區分伺服器回傳值與本地回顯)仍主動加強測試以求嚴謹 |
| E03-S025 | approved | story/E03-S025-delete-conversation-confirmation | [E03-S025.md](E03-S025.md) | 獨立審核 APPROVE(Delete Conversation Confirmation,epic 展開標題:deleteConversation 真正移除(非軟刪除,S26 Archive 另有其 story);role="alertdialog" 確認流程,唯一呼叫點在確認按鈕之後,單擊初始按鈕不會刪除;成功後串接 deleteMessagesForConversation(僅在刪除成功後才執行,失敗路徑結構性不可達)並導回列表;重複刪除同一 id 第二次正確 NOT_FOUND;0 次 FIX 循環;獨立重跑 typecheck/lint/build/383 unit/20 個目標 E2E 皆綠)；1 個 MINOR(alertdialog 的 aria-label 未帶入對話標題)已修正 |
| E03-S026 | approved | story/E03-S026-archive-unarchive-conversation | [E03-S026.md](E03-S026.md) | 獨立審核 APPROVE(Archive/unarchive conversation,epic 展開標題確認雙向可逆;listConversations 新增 archived view-selector 第三參數,全repo grep 確認唯一生產呼叫端已同步、預設值向後相容;getRecentConversations 排除已封存對話,有專屬測試;archiveConversation/unarchiveConversation 皆 NOT_FOUND fail-closed 且不誤翻按鈕標籤;archiving 不 cascade 到 messages.ts,可逆性成立;UI 無確認步驟(對稱 S024/反 S025 理由);0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/407 unit/30+ 個目標 E2E 皆綠)；2 個 MINOR(缺重複封存冪等測試——已補上並複驗 force 全量三輪皆綠;PROGRESS 備註措辭可能誤讀為審核先於實際發生——不需動作)已處理 |
| E03-S027 | approved | story/E03-S027-copy-answer-action | [E03-S027.md](E03-S027.md) | 獨立審核第 1 輪 REQUEST-CHANGES(1 個 MAJOR:單一共用 copyFeedback slot 在兩則不同訊息並行複製、以「後點擊先 resolve」順序完成時會互相覆蓋/清除確認狀態,且孤兒計時器可能在卸載後仍觸發——審核者實際寫模擬程式重現;2 個 MINOR:catch 吞掉實際錯誤原因、navigator.clipboard stub 缺 afterEach 還原)→ 修正為以 messageId 為 key 的 Map(`copyStatuses`/`copyResetTimeoutsRef`),新增直接重現該情境的測試,兩個 MINOR 一併修正 → 第 2 輪獨立審核(不同審核者、獨立寫模擬程式驗證修正、5 次重跑新測試無 flaky、fresh 重跑全部 gate 皆綠)APPROVE;2 個新 MINOR(evidence 狀態欄位過早標 APPROVED——僅文件時序問題;繞過 disabled 保護才會發生的孤兒計時器邊界情況——確認目前 UI 下結構上不可觸發,故意不加防呆)均不阻擋 |
| E03-S028 | approved | story/E03-S028-file-chat-entry-flow | [E03-S028.md](E03-S028.md) | 獨立審核 APPROVE,0 個 BLOCKER/MAJOR/MINOR(File-chat entry flow,epic 展開標題「entry flow」限定為新進入點,非 S008 附件選擇器的變形;新增獨立路由 /conversations/new-file,獨立確認 /conversations/new 的 diff 為空、且 S001 自己的既有 E2E 測試逐字不變仍全綠,零回歸主張成立;sendMessage 失敗時 rollback deleteConversation,避免留下部分建立的幽靈對話;成功導向對話詳情頁而非列表頁;message-thread.tsx 確認未被觸碰,無偷加自動串流邏輯;0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/423 unit/27 個目標 E2E/force 全量皆綠,並獨立複算 PROGRESS.md 總覽表算術正確) |
| E03-S029 | approved | story/E03-S029-file-processing-status | [E03-S029.md](E03-S029.md) | 獨立審核 APPROVE,0 個 BLOCKER/MAJOR(File-processing status UI,epic 展開標題確認範圍止於處理狀態 UI,不含真正檔案解析(E06/Team B);審核者獨立核對沿用 S21 answer-state 的 [模擬:X] mock trigger 慣例屬實;新增 attachment-failed 獨立狀態,審核者確認與訊息傳送失敗的 failed kind 是結構上不同、互斥可達的路徑;純 ephemeral 模擬不持久化,審核者自行寫測試驗證歷史訊息重新載入確實不會再閃處理中;S08 composer 與 S28 entry flow 兩個附件來源皆已涵蓋;0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/437 unit/33 個目標 E2E 皆綠,force 全量兩輪皆綠;同時修正 S028 approved 後總覽表計數未同步的既有錯誤(第二次發生,已記錄 memory);2 個 MINOR(相關迴歸 E2E 數字誤植 33/33 應為 30/30——已修正;失敗路徑 telemetry correlationId 未直接測試——結構上由單一共用 const 保證,不需額外測試)已處理 |
| E03-S030 | approved | story/E03-S030-no-evidence-abstention-ux | [E03-S030.md](E03-S030.md) | 獨立審核第 1 輪 REQUEST-CHANGES(1 個 BLOCKER:原始 EVIDENCE 宣稱 SOURCE_BASELINE 對本 story 無任何內文,實際上 line 1251 有 «» 逐字引用的顯示文字「找不到足夠企業資料支持此答案。」,先前關鍵字搜尋未涵蓋這個字串而漏掉;2 個 MINOR:policy 引用措辭過度絕對、regenerate 固定 fallback 狀態會留下內容相同的 revision 未特別處理)→ 修正 `answer-state.ts` 的 NO_EVIDENCE fallback 文字對齊 SOURCE_BASELINE 引言,同步更新 `answer-state.spec.ts`/`no-evidence-abstention.spec.ts` 的斷言,`message-thread.test.tsx` 因透過常數引用而自動套用新值;完整重跑 gate 兩輪皆綠 → 第 2 輪獨立審核 REQUEST-CHANGES(1 個 MAJOR:本列備註未同步更新,仍宣稱「未修改任何既有實作程式碼」與 BLOCKER 修正後的實況不符;1 個 MINOR:`message-thread.test.tsx` 的文件註解有一處 policy 引用措辭未同步修正)→ 已修正本列備註與該處註解措辭,待第 3 輪獨立審核複驗(`/keep-working-till-end` 流程「同一 story 最多 2 輪重審」,此為第 2 輪重審,仍在上限內)→ 第 3 輪獨立審核 APPROVE,2 個新 MINOR(前一輪修正時把重審上限規則誤植為出自 `.claude/rules/STORY_WORKFLOW.md`,實際上出自 `.claude/commands/keep-working-till-end.md`;Gate 紀錄表格未補上第 2 輪修正後的複驗列)均不阻擋,已一併修正 |
| E03-S031 | approved | story/E03-S031-stream-disconnect-reconnect-ux | [E03-S031.md](E03-S031.md) | 獨立審核 APPROVE(Stream disconnect/reconnect UX,SOURCE_BASELINE 完全無此 story 章節(E03 條目在 S30 結束)——審核者獨立複驗:通篇 grep disconnect/reconnect/斷線/重連 等關鍵字零命中,非 S30 那種關鍵字漏搜情境;lib/streaming.ts 於 S10 預留的明確伏筆經 `git show` 原始 commit 複驗屬實非事後編造;沿用 S21/S29/S30 的 [模擬:X] mock trigger 慣例;stream-disconnected 與既有 stream-failed 結構上互斥路徑經程式碼複驗;重新連線沿用原始 answerState 有專屬非預設狀態測試把關;0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/452 unit/32 個目標 E2E 皆綠;零 BLOCKER/MAJOR/MINOR) |
| E03-S032 | approved | story/E03-S032-message-retry-ux | [E03-S032.md](E03-S032.md) | 獨立審核 APPROVE(Message retry UX,SOURCE_BASELINE 無此 story 章節(E03 條目在 S30 結束);修正 `handleRetryStream` 遺失 `reviseTarget`/`answerState` 的真實 bug——重試一次失敗的 regenerate 原本會產生重複訊息而非更新原訊息,直接違反 AC 5;審核者獨立重建 fix 前的舊程式碼親自追蹤確認 bug 屬實可達、兩個新測試在舊碼下確實會失敗;`stream-disconnected` 同形狀缺口因目前不可達,刻意不動,審核者亦獨立確認;0 次 FIX 循環;typecheck/lint/build/454 unit/32 個目標 E2E 皆綠,force 全量兩輪皆綠;1 個 MINOR(測試註解鑑別力宣稱過度)已修正) |
| E03-S033 | approved | story/E03-S033-conversation-e2e-mocked-backend | [E03-S033.md](E03-S033.md) | 獨立審核 APPROVE(conversation E2E with mocked backend,**E03 全部 33 個 story 完成**;SOURCE_BASELINE 無此 story 章節,範圍依 epic 標題本身+SOURCE_BASELINE §11 團隊分工+稽核既有 30+ 個 spec 找到的組合層級覆蓋缺口判斷,審核者親自複驗四個缺口全部屬實,不需 advisor;純新增一個 spec 檔(2 個測試),無任何原始碼變更;1 次 FIX 循環(測試自己的 locator scope 遺漏,非產品 bug);typecheck/lint/build/454 unit/27 個目標 E2E 皆綠,force 全量兩輪(107 E2E)皆綠;1 個 MINOR——FIX 根因原判斷有誤(誤歸因 NotificationCenter),審核者指出後實測確認真正原因是 Next.js route announcer,已更正 EVIDENCE 與測試註解) |

## E05 Knowledge Management Experience(31)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E05-S001 | approved | story/E05-S001-knowledge-list-page | [E05-S001.md](E05-S001.md) | 獨立審核 APPROVE(Knowledge list page,E05 第一個 story;SOURCE_BASELINE 僅標題,但 nav-items.ts 早在 E01-S006 就明確預告「each is created by its owning epic's own first story」,審核者用 git log --follow 複驗屬實,不需 advisor;鏡射 E03-S001「當時」(非現在累積後)的原始形狀,審核者用 git show 逐項比對確認;SOURCE_BASELINE 把 List/Search/Create/Edit/Detail 拆成各自獨立 story,故本 story 只做列表;0 次 FIX 循環;typecheck/lint/build/460 unit/19 個目標 E2E 皆綠,force 全量兩輪(108 E2E)皆綠;1 個 MINOR(Scope 說明未明確記錄已讀過 epic 檔章節)已修正) |
| E05-S002 | approved | story/E05-S002-knowledge-search-filter | [E05-S002.md](E05-S002.md) | 獨立審核 APPROVE(Knowledge search/filter;直接鏡射 E03-S023 conversation search 的既有設計,審核者用 git show 逐項比對確認;刻意不加分頁——SOURCE_BASELINE 的 E05 清單無對應 story,審核者直接複驗;0 次 FIX 循環;typecheck/lint/build/467 unit/22 個目標 E2E 皆綠,force 全量兩輪(111 E2E)皆綠;3 個 MINOR(行號引用錯誤、2 個測試標題宣稱過度)已修正) |
| E05-S003 | approved | story/E05-S003-create-kb-form | [E05-S003.md](E05-S003.md) | 獨立審核 APPROVE(Create KB form;新增 `/knowledge/new` 表單路由與 `createKnowledgeBase`/`writeStore`,鏡射 `conversations/new`+`rename-conversation` 既有設計;0 個 BLOCKER/MAJOR/MINOR;0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/481 unit/3+25 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 114 E2E 全過、無 flaky) |
| E05-S004 | approved | story/E05-S004-edit-kb-metadata | [E05-S004.md](E05-S004.md) | 獨立審核 APPROVE(Edit KB metadata;新增 `/knowledge/[id]/edit` 表單路由與 `getKnowledgeBase`/`updateKnowledgeBase`,鏡射 `ConversationDetail`+`/knowledge/new` 既有設計;0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環——E2E not-found 測試因 mock session 是純記憶體變數、`page.goto()` 會清空而無法測,審核者獨立重新追蹤 SessionGate/layout/not-found.tsx 原始碼四個環節確認根因屬實,移除決策誠實無造假;審核者獨立重跑 typecheck/lint/build/500 unit/3+28 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 117 E2E 全過、無 flaky) |
| E05-S005 | approved | story/E05-S005-kb-detail-page | [E05-S005.md](E05-S005.md) | 獨立審核 APPROVE(KB detail page;新增 `/knowledge/[id]` 完全重用 S04 既有 `getKnowledgeBase`,零 lib 變更;鏡射 `ConversationDetail`+`conversation-list.tsx` 既有設計;0 個 BLOCKER/MAJOR;2 個 MINOR(doc comment 排版空行、測試註解 Unicode 字元名稱不精確)皆由審核者當場修正;1 次 FIX 循環——toLocaleString 隱藏空白字元導致斷言失敗,審核者獨立寫 Node 腳本重現字元碼證實根因屬實;審核者獨立重跑 typecheck/lint/build/507 unit/2+30 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 119 E2E 全過、無 flaky) |
| E05-S006 | approved | story/E05-S006-kb-permission-editor | [E05-S006.md](E05-S006.md) | 獨立審核 APPROVE(KB permission editor;開工前 `/advisor` 分析權限模型,依 SOURCE_BASELINE §5/§15 選用 `@ai-km/permissions` 既有 `Role` 型別,審核者獨立重讀原始碼確認 `listKnowledgeBases()` 完全不依角色過濾、「is a setting only」測試真實有效,證實「純設定非強制執行」的核心宣稱屬實;0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環(文字節點分割導致的 exact-match 斷言問題,已根因修正);審核者獨立重跑 typecheck/lint/build/529 unit/2+32 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 121 E2E 全過、無 flaky) |
| E05-S007 | approved | story/E05-S007-kb-member-editor | [E05-S007.md](E05-S007.md) | 獨立審核 APPROVE(KB member editor;延續 S006 的「純設定非強制執行」邊界,member 為不透明識別字串(無真正使用者目錄);審核者獨立讀原始碼確認正規化邏輯與「is a setting only」測試屬實,獨立重查 SOURCE_BASELINE 對 Member 的提及確認範圍判斷有據;0 個 BLOCKER/MAJOR/MINOR;0 次 FIX 循環;審核者獨立重跑 typecheck/lint/build/552 unit/2+34 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 123 E2E 全過、無 flaky) |
| E05-S008 | approved | story/E05-S008-kb-prompt-binding-ui | [E05-S008.md](E05-S008.md) | 獨立審核 APPROVE(KB prompt binding UI;提示詞直接存於 KB 自身,無真正 Prompt 實體(E11-S12/E12 皆尚未開工);Functional AC 7 判定不適用(內容/設定變更,非存取控制),telemetry 不外洩提示詞原文並有專屬測試驗證;0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環(新摘要與 S006 既有摘要撞名,橫跨 unit+E2E,已根因修正);審核者逐行覆核對 S006 既有 E2E spec 的 2 處必要修正,確認是精確化而非放寬;審核者獨立重跑 typecheck/lint/build/574 unit/2+36 個目標 E2E 皆綠,force 全量(build+test)三輪(DEV 兩輪+審核一輪)皆為 125 E2E 全過、無 flaky) |
| E05-S009 | approved | story/E05-S009-kb-model-binding-ui | [E05-S009.md](E05-S009.md) | 獨立審核 APPROVE(KB model binding UI;`boundModel` 重用既有 `AiModel`/`AI_MODELS`(E03-S005),不新增獨立型別,選項清單/標籤/disabled 狀態與 `ModelSelector` 共用同一事實來源,審核者獨立讀 `conversations.ts` 原始碼確認「伺服器端拒絕 disabled 模型」與 `setConversationModel` 驗證順序完全一致的宣稱屬實,非編造;即時套用單選(鏡射 `ModelSelector`),多一個「未綁定,依對話設定」選項;telemetry 記錄實際 from/to/model 值(與 S008 排除提示詞原文相反,因模型是固定詞彙非自由格式內容);0 個 BLOCKER/MAJOR/MINOR;0 次 FIX 循環;未修改任何既有測試檔案斷言(未重演 S008 的摘要文字撞名問題);審核者獨立重跑 typecheck/lint/build/599 unit/128 E2E 皆綠,force 全量(typecheck+lint/build/test)三輪皆 0 cache 全過,與 DEV 階段數字完全一致、無 flaky) |
| E05-S010 | approved | story/E05-S010-kb-document-list | [E05-S010.md](E05-S010.md) | 獨立審核 APPROVE(KB document list;第一次引入全新實體 `KnowledgeBaseDocument`(獨立模組 `knowledge-documents.ts`,鏡射 `messages.ts` vs `ConversationSummary` 的既有 collection-vs-parent 先例,審核者獨立讀 `messages.ts` 原始碼確認 `listMessages` 逐字相同的「純過濾不查存在」結構屬實);真正的 Document 實體屬於 E06(Team B,36 個 sub-story 皆 todo);純列表,不含上傳(S011-S016)/進度/失敗狀態(S017-S020)/版本控制(E06-S30-32);種子資料刻意分布 3/1/0 筆橫跨既有 3 個 KB fixture,涵蓋多筆/單筆/空清單三態;detail 頁新增文件數量摘要(非清單本身),第二層 fetch 失敗時優雅降級為「－」而非整頁報錯,審核者逐行覆核控制流程確認宣稱屬實;`formatFileSize` 有意識地與 E03 domain 的既有實作重複而非跨 domain 重構,審核者逐字元比對確認完全相同且未觸碰 E03 檔案;0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環(typecheck strict-mode 索引存取,單次修正);審核者獨立重跑 typecheck/lint/build/622 unit/131 E2E 皆綠,force 全量三輪皆 0 cache 全過,與 DEV 階段數字完全一致、無 flaky) |
| E05-S011 | approved | story/E05-S011-single-file-upload | [E05-S011.md](E05-S011.md) | 獨立審核 APPROVE(Single-file upload;上傳元件內嵌在既有 `/knowledge/[id]/documents` 頁面(非獨立路由),鏡射 `messages.ts` sendMessage 內嵌於對話頁的既有先例;`addKnowledgeBaseDocument` 只收 name/sizeBytes 純值,沿用 E03-S008 FileAttachmentPicker「無真實上傳」的既有先例(E06 Upload API/Object Storage 皆 Team B、todo);選檔→確認上傳兩段式,失敗保留選擇(審核者逐行覆核 handleUpload 確認 setSelectedFile(null) 只在成功路徑);telemetry 記錄 sizeBytes 但絕不記錄檔名(審核者確認三個 trackEvent 呼叫的 properties 皆不含檔名);`formatFileSize` 與 S010 共用同一 domain 內的檔案,審核者確認舊本地定義已刪除、雙方皆改為 import,非假重構;Functional AC 7 判定不適用(同 S003);0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環(E2E locator strict-mode 衝突,`<input type="file">` 隱含 role=button 與其 label 造成的 substring 誤命中,審核者確認修法乾淨、未波及任何既有斷言);審核者獨立重跑 typecheck/lint/build/638 unit/133 E2E 皆綠,force 全量三輪皆 0 cache 全過,與 DEV 階段數字完全一致、無 flaky) |
| E05-S012 | approved | story/E05-S012-multi-file-upload | [E05-S012.md](E05-S012.md) | 獨立審核 APPROVE(Multi-file upload;純延伸 S011 既有的 `KnowledgeDocumentUpload` 元件與 `addKnowledgeBaseDocument`(未新增任何 lib export,審核者以 `git diff --name-only` 結構性確認 `knowledge-documents.ts` 未被觸碰);選取採累加而非取代,鏡射 `MessageComposer`/`FileAttachmentPicker`(E03-S008)既有先例;循序(非平行)逐檔呼叫,明確分析並拒絕依賴 microtask 排程巧合的平行呼叫方案,審核者逐行覆核 `handleUpload` 確認 `for...of`+`await`、每檔獨立 correlationId 屬實;每個檔案獨立單位,部分失敗不影響其他檔案,失敗的留在清單供重試,審核者確認 remaining/anySucceeded 邏輯與宣稱一致;telemetry 每檔各自一組 attempt/success/failure;0 個 BLOCKER/MAJOR/MINOR;2 次 FIX 循環(RTL/Playwright `exact` 選項語意誤用,審核者直讀 `ByRoleOptions` 型別定義確認根因屬實;E2E `getByRole("listitem")` 誤命中 app shell 導覽項目,修正為 `aria-label` 限定範圍);審核者獨立重跑 typecheck/lint/build/646 unit/134 E2E 皆綠,force 全量三輪皆 0 cache 全過,與 DEV 階段數字完全一致、無 flaky) |
| E05-S013 | approved | story/E05-S013-folder-upload | [E05-S013.md](E05-S013.md) | 獨立審核 APPROVE(Folder upload;純延伸 S011/S012 既有的 `KnowledgeDocumentUpload` 元件(未新增任何 lib export,審核者以 `git diff --name-only` 結構性確認);新增第二個獨立 `<input webkitdirectory>`(callback ref 命令式設定,避免 `any` 型別斷言,審核者確認 diff 中 0 筆 `as any`);`displayName()` 優先採用 `webkitRelativePath` 保留資料夾結構,審核者確認四處呼叫點(上傳/顯示/移除按鈕/key)皆一致套用;0 個 BLOCKER/MAJOR/MINOR;1 次 FIX 循環(Playwright 拒絕對 webkitdirectory input 使用 buffer-based setInputFiles,改用真實臨時資料夾反而讓驗證更真實,審核者親自重跑確認該測試真的通過且用 try/finally 清理);審核者獨立重跑 typecheck/lint/build/654 unit/135 E2E 皆綠,force 全量三輪皆 0 cache 全過,PROGRESS.md 逐列手動計數複核一致,與 DEV 階段數字完全一致、無 flaky) |
| E05-S014 | approved | story/E05-S014-url-import | [E05-S014.md](E05-S014.md) | 獨立審核 APPROVE(URL import;`KnowledgeBaseDocument.sizeBytes` 改為選填(URL 匯入無真實位元組數可回報,不捏造佔位數字);新增獨立 `addKnowledgeBaseDocumentFromUrl`(格式驗證+http(s)協定白名單,審核者確認 `javascript:`/`file:` 皆有專屬拒絕測試);`KnowledgeDocumentUrlImport` 獨立元件(文字輸入+明確送出);顯示具體錯誤訊息(刻意偏離 S009 用固定通用字串的既有做法,審核者確認兩種失敗情境顯示兩種不同訊息,證實非寫死);0 個 BLOCKER/MAJOR,1 個 MINOR(doc comment 多餘空白行,審核者當場修正);2 次 FIX 循環(`type="url"` 原生驗證攔截 submit 導致自訂驗證/錯誤訊息完全被繞過,改用 type="text";E2E route-announcer 碰撞,審核者確認此寫法已是 3 個既有 spec 檔案使用的既有慣用法,非權宜之計);審核者獨立重跑 typecheck/lint/build/676 unit/136 E2E 皆綠,force 全量三輪皆 0 cache 全過,PROGRESS.md 逐列手動計數複核一致,與 DEV 階段數字完全一致、無 flaky) |
| E05-S015 | approved | story/E05-S015-text-knowledge-input | [E05-S015.md](E05-S015.md) | 獨立審核 APPROVE(Text knowledge input;`KnowledgeBaseDocument` 新增選填 `content`,真的儲存輸入文字(與 S011-S014「不假裝擁有不存在的資料」同一原則的相反應用);`sizeBytes` 為真實計算的 UTF-8 位元組數(`new Blob(...).size`),審核者獨立用 `node -e` 複驗「知識」= 6 位元組屬實,與 S014 URL 匯入省略此欄位形成刻意對照;標題/內容雙欄位分離;空白內容明確拒絕;`KnowledgeDocumentTextInput` 第三個獨立元件;0 個 BLOCKER/MAJOR/MINOR;0 次 FIX 循環(全部 gate 一次通過,審核者獨立重跑同樣一次全線通過);審核者獨立重跑 typecheck/lint/build/697 unit/137 E2E 皆綠,force 全量三輪皆 0 cache 全過,PROGRESS.md 逐列手動計數複核一致,與 DEV 階段數字完全一致、無 flaky) |
| E05-S016 | todo | | | |
| E05-S017 | todo | | | |
| E05-S018 | todo | | | |
| E05-S019 | todo | | | |
| E05-S020 | todo | | | |
| E05-S021 | todo | | | |
| E05-S022 | todo | | | |
| E05-S023 | todo | | | |
| E05-S024 | todo | | | |
| E05-S025 | todo | | | |
| E05-S026 | todo | | | |
| E05-S027 | todo | | | |
| E05-S028 | todo | | | |
| E05-S029 | todo | | | |
| E05-S030 | todo | | | |
| E05-S031 | todo | | | |

## E07 Maintenance Assistant Experience(25)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E07-S001 | todo | | | |
| E07-S002 | todo | | | |
| E07-S003 | todo | | | |
| E07-S004 | todo | | | |
| E07-S005 | todo | | | |
| E07-S006 | todo | | | |
| E07-S007 | todo | | | |
| E07-S008 | todo | | | |
| E07-S009 | todo | | | |
| E07-S010 | todo | | | |
| E07-S011 | todo | | | |
| E07-S012 | todo | | | |
| E07-S013 | todo | | | |
| E07-S014 | todo | | | |
| E07-S015 | todo | | | |
| E07-S016 | todo | | | |
| E07-S017 | todo | | | |
| E07-S018 | todo | | | |
| E07-S019 | todo | | | |
| E07-S020 | todo | | | |
| E07-S021 | todo | | | |
| E07-S022 | todo | | | |
| E07-S023 | todo | | | |
| E07-S024 | todo | | | |
| E07-S025 | todo | | | |

## E09 AI ERP & Reporting Experience(24)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E09-S001 | todo | | | |
| E09-S002 | todo | | | |
| E09-S003 | todo | | | |
| E09-S004 | todo | | | |
| E09-S005 | todo | | | |
| E09-S006 | todo | | | |
| E09-S007 | todo | | | |
| E09-S008 | todo | | | |
| E09-S009 | todo | | | |
| E09-S010 | todo | | | |
| E09-S011 | todo | | | |
| E09-S012 | todo | | | |
| E09-S013 | todo | | | |
| E09-S014 | todo | | | |
| E09-S015 | todo | | | |
| E09-S016 | todo | | | |
| E09-S017 | todo | | | |
| E09-S018 | todo | | | |
| E09-S019 | todo | | | |
| E09-S020 | todo | | | |
| E09-S021 | todo | | | |
| E09-S022 | todo | | | |
| E09-S023 | todo | | | |
| E09-S024 | todo | | | |

## E11 Admin Console(25)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E11-S001 | todo | | | |
| E11-S002 | todo | | | |
| E11-S003 | todo | | | |
| E11-S004 | todo | | | |
| E11-S005 | todo | | | |
| E11-S006 | todo | | | |
| E11-S007 | todo | | | |
| E11-S008 | todo | | | |
| E11-S009 | todo | | | |
| E11-S010 | todo | | | |
| E11-S011 | todo | | | |
| E11-S012 | todo | | | |
| E11-S013 | todo | | | |
| E11-S014 | todo | | | |
| E11-S015 | todo | | | |
| E11-S016 | todo | | | |
| E11-S017 | todo | | | |
| E11-S018 | todo | | | |
| E11-S019 | todo | | | |
| E11-S020 | todo | | | |
| E11-S021 | todo | | | |
| E11-S022 | todo | | | |
| E11-S023 | todo | | | |
| E11-S024 | todo | | | |
| E11-S025 | todo | | | |

## E13 Feedback & Analytics(17)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E13-S001 | todo | | | |
| E13-S002 | todo | | | |
| E13-S003 | todo | | | |
| E13-S004 | todo | | | |
| E13-S005 | todo | | | |
| E13-S006 | todo | | | |
| E13-S007 | todo | | | |
| E13-S008 | todo | | | |
| E13-S009 | todo | | | |
| E13-S010 | todo | | | |
| E13-S011 | todo | | | |
| E13-S012 | todo | | | |
| E13-S013 | todo | | | |
| E13-S014 | todo | | | |
| E13-S015 | todo | | | |
| E13-S016 | todo | | | |
| E13-S017 | todo | | | |

