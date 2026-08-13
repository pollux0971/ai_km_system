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
| E01 Application Shell & User Workspace | 20 | 17 | 0 | 1 | 0 | 2 |
| E03 AI Conversation Experience | 33 | 0 | 0 | 0 | 0 | 33 |
| E05 Knowledge Management Experience | 31 | 0 | 0 | 0 | 0 | 31 |
| E07 Maintenance Assistant Experience | 25 | 0 | 0 | 0 | 0 | 25 |
| E09 AI ERP & Reporting Experience | 24 | 0 | 0 | 0 | 0 | 24 |
| E11 Admin Console | 25 | 0 | 0 | 0 | 0 | 25 |
| E13 Feedback & Analytics | 17 | 0 | 0 | 0 | 0 | 17 |
| **合計** | **175** | 17 | 0 | 0 | 0 | 158 |

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
| E01-S018 | in-progress | story/E01-S018-app-level-error-boundary | | |
| E01-S019 | todo | | | |
| E01-S020 | todo | | | |

## E03 AI Conversation Experience(33)

| Story | 狀態 | Branch | Evidence | 備註 |
|---|---|---|---|---|
| E03-S001 | todo | | | |
| E03-S002 | todo | | | |
| E03-S003 | todo | | | |
| E03-S004 | todo | | | |
| E03-S005 | todo | | | |
| E03-S006 | todo | | | |
| E03-S007 | todo | | | |
| E03-S008 | todo | | | |
| E03-S009 | todo | | | |
| E03-S010 | todo | | | |
| E03-S011 | todo | | | |
| E03-S012 | todo | | | |
| E03-S013 | todo | | | |
| E03-S014 | todo | | | |
| E03-S015 | todo | | | |
| E03-S016 | todo | | | |
| E03-S017 | todo | | | |
| E03-S018 | todo | | | |
| E03-S019 | todo | | | |
| E03-S020 | todo | | | |
| E03-S021 | todo | | | |
| E03-S022 | todo | | | |
| E03-S023 | todo | | | |
| E03-S024 | todo | | | |
| E03-S025 | todo | | | |
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

