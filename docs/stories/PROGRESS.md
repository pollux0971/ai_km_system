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
| E03 AI Conversation Experience | 33 | 24 | 1 | 0 | 0 | 8 |
| E05 Knowledge Management Experience | 31 | 0 | 0 | 0 | 0 | 31 |
| E07 Maintenance Assistant Experience | 25 | 0 | 0 | 0 | 0 | 25 |
| E09 AI ERP & Reporting Experience | 24 | 0 | 0 | 0 | 0 | 24 |
| E11 Admin Console | 25 | 0 | 0 | 0 | 0 | 25 |
| E13 Feedback & Analytics | 17 | 0 | 0 | 0 | 0 | 17 |
| **合計** | **175** | 44 | 1 | 0 | 0 | 130 |

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
| E03-S025 | done | story/E03-S025-delete-conversation-confirmation | [E03-S025.md](E03-S025.md) | Delete Conversation Confirmation(epic 展開標題):deleteConversation 真正移除(非軟刪除,S26 Archive 另有其 story);role="alertdialog" 確認流程;成功後串接 deleteMessagesForConversation 清理訊息並導回列表;0 次 FIX 循環一次全綠;待獨立審核 |
| E03-S026 | todo | | | |
| E03-S027 | todo | | | |
| E03-S028 | todo | | | |
| E03-S029 | todo | | | |
| E03-S030 | todo | | | |
| E03-S031 | todo | | | |
| E03-S032 | todo | | | |
| E03-S033 | todo | | | |

## E05 Knowledge Management Experience(31)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E05-S001 | todo | | | |
| E05-S002 | todo | | | |
| E05-S003 | todo | | | |
| E05-S004 | todo | | | |
| E05-S005 | todo | | | |
| E05-S006 | todo | | | |
| E05-S007 | todo | | | |
| E05-S008 | todo | | | |
| E05-S009 | todo | | | |
| E05-S010 | todo | | | |
| E05-S011 | todo | | | |
| E05-S012 | todo | | | |
| E05-S013 | todo | | | |
| E05-S014 | todo | | | |
| E05-S015 | todo | | | |
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

