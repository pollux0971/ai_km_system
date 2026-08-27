# ADR 0003: apps/api runtime = Fastify + better-sqlite3；跨視窗同步走 SSE

Status: Proposed（使用者 2026-08-28 拍板方向：真後端 + SQLite + SSE；細節
由本 ADR 固定，供 E02-S032 / E04-S039～S044 / E12-S031 / E03-S034～S039
平行開發時共用，不得各自另起爐灶）

## Context

使用者要求「持久化聊天」與「開同樣視窗聊天內容可同步」，並選擇真後端方案
（`apps/api` + 資料庫 + 推播），即使最終部署為單一主機也要保留跨裝置能力。
現況：`apps/api`、`services/*`、`db/*` 僅有 README；`contracts/openapi/core.yaml`
無任何 path；前端所有資料層皆為 sessionStorage mock（`apps/web/src/lib/
conversations.ts`、`messages.ts`）；mock 登入 session 為記憶體變數，開新分頁即
登出。E04-S037 已拍板地端推論走 Node（node-llama-cpp），後端技術棧應與
monorepo 的 Node 22 / TypeScript / pnpm / Turborepo 一致。

## Decision

1. **Runtime**：`apps/api` 以 **Fastify 5**（Node 22、TypeScript strict、ESM）
   實作，單一 process，預設監聽 `127.0.0.1:4000`，所有 route 掛在 `/v1`。
   Domain 程式碼不放在 `apps/api` 內，而是依 canonical layout 放在
   `services/<domain>`（`@ai-km/service-identity`、`@ai-km/service-conversation`、
   `@ai-km/service-model-gateway`），每個 service 輸出一個 Fastify plugin；
   `apps/api` 只負責 bootstrap（設定、DB 連線、migration、錯誤封套、
   correlation id、健康檢查、plugin 註冊）。
2. **Persistence**：**SQLite** via `better-sqlite3`（同步 API、WAL、
   `foreign_keys=ON`、單檔 `AI_KM_DB_PATH`，預設 `./data/ai-km.sqlite`，
   `data/` 入 `.gitignore`）。Migration 為純 SQL 檔放 `db/migrations/
   <YYYYMMDDHHMM>_<name>.sql`，由 `apps/api` 啟動時（與 `pnpm --filter
   @ai-km/api migrate`）依檔名排序套用，記錄於 `schema_migrations`。PostgreSQL
   為明確非目標；repository 以純 SQL prepared statement 實作，不引入 ORM。
3. **Contract-first 落實方式**：server 啟動時載入 `contracts/openapi/*.yaml`，
   route 的 request schema **直接取自 contract 的 components.schemas**
   （不另抄一份），response 於 contract test 以 OpenAPI schema 驗證。
   契約與實作分歧 = contract test 紅，不允許以放寬 schema 讓其變綠。
4. **錯誤封套**：沿用 `core.yaml` 的 `Error {code, message, details?}`。穩定
   code 集合：`VALIDATION_ERROR`(400)、`UNAUTHENTICATED`(401)、
   `PERMISSION_DENIED`(403)、`NOT_FOUND`(404)、`CONFLICT`(409)、
   `PAYLOAD_TOO_LARGE`(413)、`UNSUPPORTED_MEDIA_TYPE`(415)、
   `SERVICE_UNAVAILABLE`(503)、`GATEWAY_TIMEOUT`(504)、`INTERNAL_ERROR`(500)。
   Domain 專屬 code（如 `INVALID_CREDENTIALS`、`ASR_UNAVAILABLE`）由各
   contract 宣告。Stack trace 永不外露。
5. **Correlation**：沿用 `apps/web/src/middleware.ts` 的 `x-correlation-id`
   header；API 接收即沿用、缺則產生，回應 header 回填，structured log 每筆
   附帶。
6. **前端存取路徑**：瀏覽器一律打同源 `/api/v1/*`；`apps/web/next.config.ts`
   以 `rewrites()` 轉發至 `API_INTERNAL_URL`（預設 `http://127.0.0.1:4000`）。
   正式部署由反向代理（nginx/caddy，同時負責 HTTPS）做同一件事。保留
   `NEXT_PUBLIC_API_BASE_URL` 作為跨 origin 直連的逃生門（需 `@fastify/cors`
   allowlist + `credentials: include`）。
7. **跨視窗同步 transport**：**SSE**（`GET /v1/conversations/events`，
   `text/event-stream`），每個使用者（owner）一條串流；每次資料異動在同一
   transaction 寫入 `change_events`（每 owner 單調遞增 id），SSE 以該 id 為
   `id:` 欄位，支援 `Last-Event-ID` 重播，每 15 秒送 heartbeat comment。
   單 process 內以 EventEmitter 扇出。WebSocket 為明確非目標（同步只需
   server→client 單向通知；生成中串流文字不同步，使用者 2026-08-28 拍板）。
8. **驗證/測試**：service package 以 Vitest 測試（延續 ADR 0002）；Fastify
   `inject()` 做 route 測試；每個 route 的 contract test 為 L2 gate。

## Consequences

- Team B 佔位資料夾（`apps/api`、`services/*`、`db/*`）開始有真實程式碼；
  依使用者 2026-08-28 指示，本批 story 明示允許 Team A/B 同一開發者在這些
  資料夾工作，story 邊界仍逐一列出允許/禁止修改清單。
- 前端 `lib/conversations.ts`、`lib/messages.ts` 由 sessionStorage mock 轉為
  typed client adapter（函式簽名不變，呼叫端不動）；既有直接斷言
  sessionStorage 的測試需依新 AC 改寫並逐檔記錄（規格變更，非放寬）。
- E2E 需同時啟動 `apps/api`；隔離策略見 ADR 0005（test sandbox）。
- 未來若拆成多 process 或換 PostgreSQL，需新 ADR；`change_events` 的
  單調 id 與 SSE 重播設計已為多 process 預留（改為輪詢 DB 即可）。
