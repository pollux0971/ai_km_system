# 增補 story 規格索引（2026-08-28，共 44 個）

每個 story 一份獨立文件，內容為對應 epic 檔章節的逐字副本（含 Metadata、
技術決策、Scope In/Out、依賴關係、四類 Acceptance Criteria、開發邊界的
允許/禁止修改清單、Non-Goals、Test Obligations、DoD、Anti-hallucination Guard）。

**規格權威仍是 `AI_KM_BMAD_High_Granularity/epics/*.md`**；本目錄只是為了讓
單一 story 開發時不必在數十萬字的 epic 檔裡捲動。狀態一律看
`docs/stories/PROGRESS.md`；完成證據寫在 `docs/stories/EXX-SYYY.md`（與本
目錄的 `EXX-SYYY.spec.md` 是不同檔案，不要混淆）。

- 排程、依賴圖、平行 lane：`docs/architecture/voice-persistence-sync-m3.md`
- 技術債稽核（兩輪）：`docs/architecture/tech-debt-audit-2026-08-28.md`
- 待批示的視覺假設：`docs/stories/PENDING_DECISIONS.md`

> 下表的「HARD 依賴」為摘要，完整依賴（含 SOFT 依賴、下游 story、檔案
> 交集）在各 story 檔的「依賴關係（平行開發用）」小節。

| Story | 標題 | 優先 | 大小 | HARD 依賴 | 批次 |
|---|---|---|---|---|---|
| [E01-S021](E01-S021.spec.md) | Material 3 design token 基礎 | P1 | 1–1.5 developer-days | 無。 | 批次一 |
| [E01-S022](E01-S022.spec.md) | 自託管字型與圖示 | P1 | 1 developer-day | 無。 | 批次一 |
| [E01-S023](E01-S023.spec.md) | App shell Material 3 化 | P1 | 1.5–2 developer-days | E01-S021、E01-S022。 | 批次一 |
| [E01-S024](E01-S024.spec.md) | 首頁 Material 3 tiles | P1 | 1 developer-day | E01-S021、E01-S022。 | 批次一 |
| [E01-S025](E01-S025.spec.md) | 其餘頁面 Material 3 一致性 | P2 | 2 developer-days | E01-S021、E01-S022、E01-S023、E01-S024。 | 批次一 |
| [E01-S026](E01-S026.spec.md) | 品牌與空狀態素材 | P2 | 1 developer-day | 無。 | 批次一 |
| [E01-S027](E01-S027.spec.md) | E2E 穩定性強化 | P1 | 1 developer-day | E03-S038。 | 批次二 |
| [E01-S028](E01-S028.spec.md) | 內網 HTTPS 部署與一鍵啟動 | P1 | 1 developer-day | E04-S039(api 存在)。 | 批次二 |
| [E01-S029](E01-S029.spec.md) | 安全性 HTTP headers | P1 | 0.5–1 developer-day | E04-S039。 | 批次三 |
| [E01-S030](E01-S030.spec.md) | Playwright `reuseExistingServer` CI 安全模式 | P2 | 0.25–0.5 developer-day | E03-S038。 | 批次三 |
| [E02-S031](E02-S031.spec.md) | Contract 凍結 | P0 | 0.5 developer-day | 無。 | 批次一 |
| [E02-S032](E02-S032.spec.md) | 實作 session-cookie 登入薄切片 | P0 | 1.5–2 developer-days | E02-S031、E04-S039(骨架與 auth 介面)、E04-S040 (migration runner)。 | 批次一 |
| [E02-S033](E02-S033.spec.md) | 管理員帳號 seed 與最小角色守門 | P0 | 0.5–1 developer-day | E02-S032。 | 批次二 |
| [E02-S034](E02-S034.spec.md) | 登入速率限制與帳號鎖定 | P0 | 1 developer-day | E02-S032。 | 批次三 |
| [E03-S034](E03-S034.spec.md) | `@ai-km/api-client` codegen pipeline | P0 | 1 developer-day | 至少一個含 paths 的 spec 已合併(E04-S038 或 E02-S031 或 E12-S029 任一)；建議以 E04-S038 為驗證對象。 | 批次一 |
| [E03-S035](E03-S035.spec.md) | HTTP AuthClient 與 apps/web 接線 | P0 | 1 developer-day | E02-S031、E03-S034。 | 批次一 |
| [E03-S036](E03-S036.spec.md) | `lib/conversations.ts` 改為 typed-client adapter | P0 | 1.5–2 developer-days | E04-S038、E03-S034、E03-S035。 | 批次一 |
| [E03-S037](E03-S037.spec.md) | `lib/messages.ts` 改為 typed-client adapter | P0 | 1.5–2 developer-days | E04-S038、E03-S036。 | 批次一 |
| [E03-S038](E03-S038.spec.md) | E2E 基礎設施 | P0 | 1–1.5 developer-days | E02-S032、E04-S041、E04-S042、E04-S043、E03-S035、 E03-S036、E03-S037。 | 批次一 |
| [E03-S039](E03-S039.spec.md) | 跨視窗同步 client | P0 | 1.5–2 developer-days | E04-S038、E03-S036、E03-S037。 | 批次一 |
| [E03-S040](E03-S040.spec.md) | 語音擷取 lib | P1 | 1–1.5 developer-days | 無。 | 批次一 |
| [E03-S041](E03-S041.spec.md) | Push-to-talk 語音輸入按鈕 | P1 | 1.5–2 developer-days | E12-S029、E03-S034、E03-S040、E03-S042。 | 批次一 |
| [E03-S042](E03-S042.spec.md) | 語音狀態視覺素材 | P1 | 1 developer-day | 無。 | 批次一 |
| [E03-S043](E03-S043.spec.md) | 對話頁 Material 3 化 | P1 | 2 developer-days | E01-S021、E01-S022、E03-S039、E03-S041、E03-S042。 | 批次一 |
| [E03-S044](E03-S044.spec.md) | 語音輸入＋持久化＋跨視窗同步 E2E | P0 | 1 developer-day | E03-S038、E03-S039、E03-S041、E03-S043(最終版式)、 E04-S044、E12-S031。 | 批次一 |
| [E03-S045](E03-S045.spec.md) | 模擬觸發字串以 feature flag 閘門 | P1 | 0.5–1 developer-day | E03-S041(`feature-flags.ts` 先行)、E03-S038(config)。 | 批次二 |
| [E03-S046](E03-S046.spec.md) | `CONVERSATIONS_PAGE_SIZE` 由測試驅動的 2 改為設定值 | P2 | 0.5 developer-day | E03-S036、E03-S038。 | 批次二 |
| [E04-S038](E04-S038.spec.md) | Contract 凍結 | P0 | 0.5–1 developer-day | 無。 | 批次一 |
| [E04-S039](E04-S039.spec.md) | apps/api bootstrap | P0 | 1–2 developer-days | 無。 | 批次一 |
| [E04-S040](E04-S040.spec.md) | SQLite 持久化基礎 | P0 | 1–2 developer-days | E04-S039(`fastify.db` decorator 掛在其骨架上)。 | 批次一 |
| [E04-S041](E04-S041.spec.md) | Conversations REST | P0 | 1.5–2 developer-days | E04-S038(contract)、E04-S040(表與 repository 基底)。 | 批次一 |
| [E04-S042](E04-S042.spec.md) | Messages REST | P0 | 1–2 developer-days | E04-S038、E04-S041。 | 批次一 |
| [E04-S043](E04-S043.spec.md) | Message feedback endpoints | P1 | 1 developer-day | E04-S038、E04-S042。 | 批次一 |
| [E04-S044](E04-S044.spec.md) | Change-event SSE 串流端點 | P0 | 1–1.5 developer-days | E04-S038、E04-S040(`change_events` 表與 repository)。 | 批次一 |
| [E04-S047](E04-S047.spec.md) | `/v1/health` 擴充為 subsystem 三態 | P1 | 0.5–1 developer-day | E04-S040、E13-S018、E02-S033。 | 批次二 |
| [E04-S048](E04-S048.spec.md) | CSRF 防禦 | P0 | 0.5–1 developer-day | E04-S039、E02-S032。 | 批次三 |
| [E11-S026](E11-S026.spec.md) | apps/admin 登入與授權接線 | P0 | 1.5–2 developer-days | E02-S032、E02-S033、E03-S035、E03-S038。 | 批次二 |
| [E12-S029](E12-S029.spec.md) | Contract 凍結 | P1 | 0.5 developer-day | 無(securityScheme 未合併時以同名內嵌定義，合併後改 `$ref`——記錄於 EVIDENCE)。 | 批次一 |
| [E12-S030](E12-S030.spec.md) | ASR 環境就緒 | P1 | 1–2 developer-days | 無。 | 批次一 |
| [E12-S031](E12-S031.spec.md) | Transcription 端點 | P1 | 1.5–2 developer-days | E12-S029、E04-S039。 | 批次一 |
| [E13-S018](E13-S018.spec.md) | Contract 凍結 | P0 | 0.5–1 developer-day | E02-S031(securityScheme)、E04-S038(messages 欄位)。 | 批次二 |
| [E13-S019](E13-S019.spec.md) | `services/feedback` 實作 | P0 | 1.5–2 developer-days | E13-S018、E04-S040、E04-S043(feedback 欄位存在)、 E02-S033(`requireAnyRole`)。 | 批次二 |
| [E13-S020](E13-S020.spec.md) | apps/web `usage-events.ts` 改送 server | P1 | 1 developer-day | E13-S018、E03-S034、E03-S036(fake API 基礎)。 | 批次二 |
| [E13-S021](E13-S021.spec.md) | apps/admin 回饋佇列／使用量／延遲／系統健康四頁接真實 API | P0 | 1.5–2 developer-days | E11-S026、E13-S018、E03-S034。 | 批次二 |

## 批次說明

- **批次一（29）**：語音輸入（伺服器端 whisper）、對話持久化（apps/api +
  SQLite）、跨視窗同步（SSE）、Material 3 UI。
- **批次二（11）**：第一輪技術債／空殼修復——apps/admin 無登入、四個永遠
  回傳空／零／null 的 admin 頁面、production 可觸發的模擬後門、測試驅動
  的常數、E2E flaky 根因、HTTPS 部署。
- **批次三（4）**：第二輪技術債稽核——CSRF、登入速率限制、安全性 HTTP
  headers、Playwright CI 假綠燈防護。
