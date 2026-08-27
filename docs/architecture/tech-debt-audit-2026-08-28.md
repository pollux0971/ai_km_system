# 技術債／「假成功」story 稽核（2026-08-28）

稽核方法：`grep` 全 repo 的 `sessionStorage`／`永遠回傳`／`模擬:`／
`TODO|FIXME|HACK`／`.skip(`，並逐一讀取命中的 story EVIDENCE 與程式碼
註解（本 repo 的慣例是誠實記錄限制，所以大多數「技術債」在原始碼裡都
已自白，不是隱藏債）。**沒有發現造假綠燈**（無 skip、無放寬 assertion、
無 `|| true`）；找到的是「結構完成但誠實地卡在沒有真後端」的空殼與
「當時如此決策、現在條件變了該重訪」的假設。

## 發現

### 1. apps/admin 完全無登入、無資料橋（最大一塊）
- `apps/admin/src/app/layout.tsx` 明言 `AdminRouteGuard`（E11-S023）
  「structurally complete but deliberately not wired」，因為系統裡沒有
  任何管理員帳號、沒有 session 來源。
- 連帶：`listFeedback`／`getFeedback`（E11-S016/S017，E13-S007/S008 疊加）
  永遠回傳空／null；`getUsageMetrics`（E11-S021，E13-S009～S012 疊加）
  永遠零計數；`getLatencyMetrics`（E11-S022，E13-S013 疊加）永遠 null；
  `getSystemHealth`（E11-S022）永遠 unknown。這些 story 的 EVIDENCE **全部
  誠實記錄**「真正資料來源是 XXX，尚未建置」，審核也逐一確認過，不是
  造假——但條件（真後端）現在具備了，應該回頭補上。
- → **E02-S033**（管理員帳號 seed + 角色守門）→ **E11-S026**（登入接線）
  → **E13-S018～S021**（analytics contract + 後端 + 前後端接線）。

### 2. Production 可觸發的「模擬」後門
- `answer-state.ts`、`streaming.ts`、`file-processing.ts` 的
  `[模擬:XXX]` 觸發字串與 `service-error` 帳號，是刻意標示的誠實 demo
  hook，但目前的 build **沒有任何開關**——任何 production 使用者打
  `[模擬:PERMISSION_DENIED]` 都能讓自己看到假的權限拒絕畫面。這在純
  前端 mock 時代風險有限（反正整個後端都是假的），但接了真後端之後
  必須關掉。
- → **E03-S045**（feature flag 閘門，production 預設關閉）。

### 3. 測試驅動出的假設值外洩到「看起來像規格」的常數
- `CONVERSATIONS_PAGE_SIZE = 2` 的 doc comment 自承是「刻意選小，讓固定
  3 筆種子資料剛好跨 2 頁，測試不用先建立資料」——這是合理的測試設計，
  但常數本身沒有環境區分，如果沒人記得這個脈絡，容易被誤讀成產品決策。
- → **E03-S046**（設定化，production 20、E2E env 2）。

### 4. 已知會反覆發生但只用「隔離重跑證明非回歸」處理的 flaky
- PROGRESS.md 中至少 8 個 story（E03-S001/S010/S013/S019、E05-S031、
  E09-S024、E11-S019/S021/S022/S025、E13-S009/S010/S011/S013）都記錄過
  「一次全量並行跑到資源競爭型 flaky，獨立隔離重跑後確認非回歸」。每次
  都是誠實處理（不是加 retries 蓋過去），但從未真正解決根因；三個
  webServer（web/admin/api）之後只會更嚴重。
- → **E01-S027**（根因量測與處理：workers 數、timeout 分級、build/test
  序列化，仍保持 `retries: 0`）。

### 5. HTTPS 部署路徑不存在
- repo 有一次真實的「LAN http 存取讓 `crypto.randomUUID` 不存在」修復
  commit，代表這個系統目前是以 http 內網方式在跑；但語音輸入
  （`getUserMedia`）需要 secure context，且沒有任何反向代理／部署文件。
- → **E01-S028**（Caddy + compose + runbook）。

### 6. 未發現但列入觀察（暫不立 story）
- `packages/logger` 唯一的 `eslint-disable`（`no-console`）是合理例外，
  非技術債。
- 全 repo 零 `.skip`／`.only`／`test.fixme`／`it.todo`，符合
  STORY_WORKFLOW 鐵律。
- `FeedbackKnowledgeCandidate`（E13-S015）刻意保留回饋原文供人工審閱，
  E13-S016 EVIDENCE 已標記「未來若建了審閱介面需重新評估隱私姿態」——
  本次未建審閱介面，維持觀察，不開 story。
- `E05-S024`（Document version history）仍 `blocked-team-b`（等
  E06-S030），不受本次批次影響。

## 本次新增的 11 個修復 story

| Story | 修復對象 |
|---|---|
| E02-S033 | 管理員帳號 seed + `requireAnyRole` |
| E11-S026 | apps/admin 登入／`AdminRouteGuard` 接線 |
| E13-S018 | analytics contract |
| E13-S019 | `services/feedback` 實作 |
| E13-S020 | apps/web usage-events 改送 server |
| E13-S021 | apps/admin 四頁接真實 API |
| E04-S047 | `/v1/health` 擴充 + admin health |
| E03-S045 | 模擬觸發字串 flag 閘門 |
| E03-S046 | `CONVERSATIONS_PAGE_SIZE` 設定化 |
| E01-S027 | E2E flaky 根因處理 |
| E01-S028 | 內網 HTTPS 部署 |

## 第二輪稽核（2026-08-28，追加）

第一輪聚焦「假成功／永遠回傳空」；第二輪聚焦「cookie session 上線後才
會出現的攻擊面」，方法為對照 ADR 0005 的 session 設計與一般 web 安全
checklist（CSRF／brute-force／security headers／測試基礎設施假綠燈）
逐項檢查程式碼與規格是否有對應防禦。

### 7. Cookie session 無 CSRF 防禦
- `SameSite=Lax` 只防多數但非全部跨站情境；`POST/PATCH/DELETE` 目前
  沒有任何額外防線。
- → **E04-S048**（要求自訂 header，瀏覽器簡單跨站表單無法設定）。

### 8. 登入端點無速率限制
- `POST /auth/login` 的 scrypt + 恆定時間比對只防時間側信道，沒有防
  暴力破解的節流。
- → **E02-S034**（per-username/per-IP 節流 + 鎖定，不洩漏鎖定狀態）。

### 9. 兩個 Next app 零安全 HTTP headers
- 無 CSP／HSTS／X-Frame-Options／Referrer-Policy／Permissions-Policy；
  企業內部系統仍應設定基本防線（尤其 iframe 嵌入防護）。
- → **E01-S029**。

### 10. Playwright `reuseExistingServer: true` 的假綠燈風險
- 既有設定（非本批次引入）本機開發很方便，但若同一份 config 被用在
  CI／自動化流程，殘留的舊 process 可能讓新一輪測試在舊程式碼上跑出
  全綠。引入真後端＋SQLite 之後風險更高（舊 API 可能連著舊 schema）。
- → **E01-S030**（`CI` 環境變數切換為要求全新啟動）。

### 未再發現的項目（已檢查，暫不成案）
- 無 rate limiting 之外的注入類風險（SQL 皆走 prepared statement，見
  ADR 0003）；無明顯的 secrets 洩漏到 log／fixture；無新增的
  skip/only/fixme 測試。

## 新增 story 總表（累計 15 個）

| Story | 修復對象 |
|---|---|
| E02-S033 | 管理員帳號 seed + `requireAnyRole` |
| E11-S026 | apps/admin 登入／`AdminRouteGuard` 接線 |
| E13-S018 | analytics contract |
| E13-S019 | `services/feedback` 實作 |
| E13-S020 | apps/web usage-events 改送 server |
| E13-S021 | apps/admin 四頁接真實 API |
| E04-S047 | `/v1/health` 擴充 + admin health |
| E03-S045 | 模擬觸發字串 flag 閘門 |
| E03-S046 | `CONVERSATIONS_PAGE_SIZE` 設定化 |
| E01-S027 | E2E flaky 根因處理 |
| E01-S028 | 內網 HTTPS 部署 |
| E04-S048 | CSRF 防禦（自訂 header） |
| E02-S034 | 登入速率限制與帳號鎖定 |
| E01-S029 | 安全性 HTTP headers |
| E01-S030 | Playwright CI 假綠燈防護 |

