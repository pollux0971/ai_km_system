# ADR 0005: Session-cookie 登入薄切片（E02 前置）與 E2E test sandbox 隔離

Status: Proposed（配合使用者 2026-08-28 拍板的真後端方案；E02 完整
Identity/RBAC 仍為 Team B 後續工作，本 ADR 只定義能讓對話持久化與跨視窗
同步成立的最小 identity 切片）

## Context

真後端持久化必須知道「這筆對話是誰的」，而 `@ai-km/auth-client` 目前只有
記憶體 mock：開新分頁、硬重整即登出，第二個視窗根本進不了聊天室。E02 的
30 個 story（User/Org/Role schema、OIDC、RBAC evaluator…）不是本批次目標；
但若前端先自行發明一套身分機制，之後會與 E02 衝突。

另一個問題是 E2E 隔離：現在 264 個 E2E 靠「每個 browser context 各自的
sessionStorage」天然隔離、可平行執行；改成共用一台 API + 一顆 SQLite 後，
測試之間會互相污染（例如 S022 的「3 筆種子剛好 2 頁」斷言）。

## Decision

1. **Contract**：`contracts/openapi/auth.yaml`（E02-S031）——
   `POST /v1/auth/login`、`POST /v1/auth/logout`、`GET /v1/auth/session`，
   回應 shape 與既有 `AuthSession`（userId/roles/expiresAt/name/email/
   department/group）完全相容，error code 沿用既有 `AuthErrorCode`。
   這是 E02-S009「local authentication endpoint」的最小實作切片；E02 後續
   story 在此基礎上擴充（OIDC/LDAP/RBAC），不重做。
2. **Session 機制**：opaque random token（256-bit）存於 HttpOnly cookie
   `ai_km_session`（`SameSite=Lax`、`Path=/`、HTTPS 時 `Secure`），server 端
   只存 token 的 SHA-256；`sessions` 表含 `expires_at`（絕對 7 天）與
   `last_seen_at`（閒置 12 小時滑動）。登出即刪除 session row（冪等）。
   帳號與密碼雜湊（`node:crypto` scrypt）以 seed 建立既有 mock 的三個示範
   帳號（`demo-user`／`demo-maintenance`／`demo-sales`，密碼 `demo-pass-123`）
   與 `disabled` 帳號；角色字串與既有 mock 相同。
3. **`request.auth` decorator**：`{ userId, ownerKey, roles, sessionId }`。
   所有受保護 route 一律經 `requireSession` preHandler；未登入回 401
   `UNAUTHENTICATED`。資料 ownership 一律以 `ownerKey` 查詢；production 下
   `ownerKey === userId`。
4. **Dev-only trigger**：`AI_KM_DEV_TRIGGERS=true` 時，帳號 `service-error`
   登入回 503 `SERVICE_UNAVAILABLE`（保留既有 E2E 對該路徑的驗證能力）；
   預設關閉，production 不得開啟（啟動時若 `NODE_ENV=production` 且此旗標
   為 true 則拒絕啟動）。
5. **E2E test sandbox**：`AI_KM_TEST_SANDBOX=true` 時，每次成功登入建立
   一個新的 `ownerKey = "<userId>:sbx:<uuid>"` 並對該 ownerKey 執行已註冊的
   seeder（示範對話等），session 內看得到的 `userId` 不變。效果：每個
   Playwright browser context 各自登入 → 各自一份資料，與現況 sessionStorage
   隔離語意完全相同，264 個既有 E2E 不需為隔離改寫，可維持平行執行；同一
   context 內開第二個分頁共用 cookie → 共用 sandbox，正好用來測跨視窗同步。
   此旗標與 dev trigger 同樣受 production 啟動防護。
6. **前端**：`@ai-km/auth-client` 新增 `createHttpAuthClient()`；`apps/web/src/
   lib/auth.ts` 於 `NEXT_PUBLIC_AUTH_BACKEND=api`（預設）使用 HTTP client，
   `mock` 保留給不需後端的單元測試。cookie 由瀏覽器自動帶，前端不接觸 token。

## Consequences

- 「硬重整會登出」的既有 mock 限制消失；E2E 中為繞開該限制而改用 in-app
  導覽的測試不需改動（in-app 導覽在新機制下依然成立）。
- E02 完整 story 上線時，`sessions`/`users` 表與 `requireSession` 可直接
  擴充（加 roles 解析、OIDC 交換），不需推翻。
- Sandbox 讓資料不會跨 context 累積；「跨裝置持久化」的自動化證據以
  Playwright `storageState` 複製 cookie 至第二個 context 取得，真正的跨
  瀏覽器登入證據列為 L3 手動 evidence（sandbox 關閉時執行）。
