# 開發路線圖(暫存,全部完成後刪除本檔)

產生日期:2026-08-28。依據 `docs/stories/PROGRESS.md`(進度唯一真相)與各 story
備註欄的 HARD 依賴整理。**本檔只是排程輔助,狀態仍以 PROGRESS.md 為準。**

## 0. 現況摘要

- 總計 220 story,已 approved 179,`blocked-team-b` 1(E05-S024,等 Team B E06-S030,不排),
  `todo` 40。
- 40 個 todo 中 **E04-S037 屬 Team B**(硬體/模型環境,L3 需使用者手動),不排入 Team A 路線圖。
  → **可排程 39 個**。
- 已 approved 的前置 story(下面依賴表把它們視為 ✅ 已滿足):
  E02-S031、E04-S038、E04-S039、E04-S040、E12-S029。
- **每個 todo story 的備註都有註明 HARD 依賴**(含「無」),且各自有
  `docs/stories/specs/EXX-SYYY.spec.md`。依賴資訊完整,可直接拓撲排序。

## 1. 依賴圖(只列未完成的依賴;✅ 表示已 approved)

| Story | HARD 依賴(未完成者) | 摘要 |
|---|---|---|
| E01-S021 | 無 | M3 design token(`globals.css` **第一修改者**) |
| E01-S022 | 無 | 自託管字型 + Material Symbols `<Icon>` |
| E01-S026 | 無 | 品牌 / 空狀態 SVG(P2) |
| E03-S040 | 無 | 語音擷取 lib(AudioWorklet) |
| E03-S042 | 無 | VoiceVisualizer 素材 |
| E12-S030 | 無 | ASR 環境就緒(**L3 需使用者手動**) |
| E03-S034 | (E04-S038 ✅) | api-client codegen + openapi-fetch + drift gate |
| E04-S041 | (E04-S038/S040 ✅) | Conversations REST |
| E04-S044 | (E04-S038/S040 ✅) | Change-event SSE 端點 |
| E02-S032 | (E02-S031/E04-S039/S040 ✅) | session-cookie 登入薄切片 |
| E12-S031 | (E12-S029/E04-S039 ✅) | Transcription 端點(L3 需 E12-S030) |
| E13-S018 | (E02-S031/E04-S038 ✅) | **Contract**:analytics API(使用者已批准新增 yaml) |
| E01-S028 | (E04-S039 ✅) | 內網 HTTPS 部署 / 一鍵啟動 |
| E01-S029 | (E04-S039 ✅) | 安全 HTTP headers |
| E01-S023 | E01-S021, E01-S022 | App shell M3 化(sidebar/header;與 E03-S039 衝突) |
| E01-S024 | E01-S021, E01-S022 | 首頁 M3 tiles(recent-conversations;與 E03-S039 衝突) |
| E03-S035 | E03-S034 | HTTP AuthClient + web 接線 |
| E03-S041 | E03-S034, E03-S040, E03-S042 | Push-to-talk 按鈕 |
| E04-S042 | E04-S041 | Messages REST |
| E02-S033 | E02-S032 | 管理員 seed + `requireAnyRole` |
| E02-S034 | E02-S032 | 登入速率限制 / 鎖定 |
| E04-S048 | E02-S032 | CSRF 防禦 |
| E03-S036 | E03-S034, E03-S035 | `lib/conversations.ts` typed-client adapter |
| E04-S043 | E04-S042 | Message feedback endpoints |
| E04-S047 | E13-S018, E02-S033 | `/v1/health` 三態 + `/v1/admin/health` |
| E13-S019 | E13-S018, E04-S043, E02-S033 | `services/feedback` 實作 |
| E03-S037 | E03-S036 | `lib/messages.ts` typed-client adapter |
| E13-S020 | E13-S018, E03-S034, E03-S036 | web `usage-events.ts` 改送 server |
| E03-S039 | E03-S036, E03-S037 | 跨視窗同步 client(SSE) |
| E03-S038 | E02-S032, E04-S041/S042/S043, E03-S035/S036/S037 | **E2E 基礎設施(關鍵匯流點)** |
| E01-S025 | E01-S021～S024 | 其餘頁面 M3(`globals.css` **最後修改者**,P2) |
| E03-S043 | E01-S021/S022, E03-S039/S041/S042 | 對話頁 M3 化 |
| E03-S045 | E03-S041, E03-S038 | 模擬觸發字串 feature flag |
| E03-S046 | E03-S036, E03-S038 | `CONVERSATIONS_PAGE_SIZE` 設定化(P2) |
| E01-S027 | E03-S038 | E2E flaky 根治 |
| E01-S030 | E03-S038 | Playwright reuseExistingServer CI 安全模式(P2) |
| E11-S026 | E02-S032/S033, E03-S035/S038 | admin 登入 / session gate 接線 |
| E03-S044 | E03-S038/S039/S041/S043, E04-S044, E12-S031 | 語音+持久化+同步 E2E(**本批最後**) |
| E13-S021 | E11-S026, E13-S018, E03-S034 | admin 回饋/使用量/健康接真實 API |

**檔案交集限制(不可同時開發)**:
- E01-S023、E01-S024 ↔ E03-S039(sidebar/header、recent-conversations)
- E03-S039 ↔ E03-S043(對話頁)
- `globals.css`:E01-S021 先於所有 M3 story,E01-S025 最後。
- E03-S036 會改寫既有 lib 測試;E13-S020 改寫 E13-S009～S013/S017 測試 → 兩者不宜與其他碰
  `apps/web/lib` 測試的 story 同時進行。

## 2. 關鍵路徑

```
E03-S034 → E03-S035 → E03-S036 → E03-S037 ─┐
E02-S032 ───────────────────────────────────┼→ E03-S038 → E11-S026 → E13-S021
E04-S041 → E04-S042 → E04-S043 ─────────────┘        └→ E03-S044(需 E03-S043 ← E03-S039)
```

最長鏈:S034→S035→S036→S037→S038→S011-S026→S013-S021(7 層),或
S034→S035→S036→S037→S039→S043→S044(7 層)。**E03-S034 是全域瓶頸,第一優先。**

## 3. 七名 CLI 員工的分派(lane 制,每人一條依賴鏈,減少互等)

> 前提:**每個員工用自己的 `git worktree`**(同一 checkout 七個 session 會互相踩
> `PROGRESS.md` 與 node_modules),branch 命名 `story/EXX-SYYY-短描述`,merge 回 main 前
> `git rebase main` 解 PROGRESS.md 衝突。每個 story 都走 `/story` → `/story-review` → merge。

| Lane | 員工 | 順序(← 表示等待他人 story 先 merge) |
|---|---|---|
| **L1 api-client 主幹** | W1 | E03-S034 → E03-S035 → E03-S036 → E03-S037 → E03-S039(← E01-S023/S024 已 merge) → E03-S043(← E03-S041) → E03-S044(← S038、E04-S044、E12-S031) |
| **L2 Auth 後端** | W2 | E02-S032 → E02-S033 → E02-S034 → E04-S048 → E04-S047(← E13-S018) → E11-S026(← E03-S035、E03-S038) → E13-S021 |
| **L3 Conversations 後端** | W3 | E04-S041 → E04-S042 → E04-S043 → E04-S044 → E13-S019(← E13-S018、E02-S033) |
| **L4 M3 前端** | W4 | E01-S021 → E01-S022 → E01-S023 → E01-S024 → E01-S025(最後,可延後到 L1 的 S043 之後) |
| **L5 語音** | W5 | E03-S040 → E03-S042 → E12-S031 → E03-S041(← E03-S034) → E03-S045(← E03-S038) |
| **L6 基礎設施 / 安全** | W6 | E13-S018 → E01-S029 → E01-S028 → E12-S030(L3 手動,先做到可交付) → E01-S026 |
| **L7 E2E 匯流** | W7 | 先支援:E13-S020(← E03-S036、E13-S018)→ **E03-S038**(← L1 S037、L2 S032、L3 S043)→ E01-S027 → E01-S030 → E03-S046 |

W7 在 E03-S038 前置未齊時,可先做 E13-S020 或協助 review 其他 lane 的 `/story-review`。

## 4. 時間波次(所有 lane 同步的最壞情形)

| 波 | 可並行 story |
|---|---|
| 0 | E03-S034 / E02-S032 / E04-S041 / E01-S021 / E03-S040 / E13-S018 / E04-S044(或 E01-S029) |
| 1 | E03-S035 / E02-S033 / E04-S042 / E01-S022 / E03-S042 / E01-S029 / E12-S030 |
| 2 | E03-S036 / E02-S034 / E04-S043 / E01-S023 / E12-S031 / E01-S028 / E13-S020(等 S036) |
| 3 | E03-S037 / E04-S048 / E04-S044 / E01-S024 / E03-S041 / E01-S026 |
| 4 | **E03-S038** / E04-S047 / E13-S019 / E03-S039 |
| 5 | E11-S026 / E03-S043 / E03-S045 / E01-S027 / E01-S030 / E03-S046 / E01-S025 |
| 6 | E13-S021 / E03-S044 |

## 5. 規則提醒(每個員工開工前必讀)

1. 先讀 `CLAUDE.md`、`.claude/rules/STORY_WORKFLOW.md`、該 story 的 spec。
2. contract 只有 E13-S018 可新增 yaml(使用者已批准);其他 story 缺 contract → BLOCKED,不發明。
3. 一次一個 story;`PROGRESS.md` 狀態轉換即時提交。
4. 不造假綠燈;L3 需手動的(E12-S030、E12-S031 真實 ASR)誠實標記。
5. **E2E 是全機器互斥資源(2026-08-28 新增,強制)**。`tests/e2e/playwright.config.ts`
   的 webServer 綁死 `:3000`(web)/`:3001`(admin)且 `reuseExistingServer: true`
   ——七個 worktree 同時跑 E2E 時,先搶到 port 的 lane 會成為所有其他 lane 的
   dev server,別人的測試會跑在**你的**程式碼上,產生假綠燈/假紅燈。因此:

   ```bash
   flock /data/python/AI_KM-worktrees/.e2e.lock -c 'pnpm test'
   ```

   - 任何會啟動 dev server 或跑 Playwright 的指令都必須包在這個 `flock` 內。
   - 取得鎖之後、跑測試之前,先確認 `:3000`/`:3001` 沒有殘留 server
     (`ss -ltnp | grep -E ':300[01]'`);有殘留代表是上一輪沒收乾淨的孤兒
     process,清掉再跑。**不變式:持有這把鎖 = 唯一有權使用 3000/3001 的
     人。** 因此持鎖時看到的任何 listener 一律是孤兒,即使 `/proc/<pid>/cwd`
     指向別的 lane 的 worktree 也一樣要清——那代表那條 lane 沒收乾淨,不是
     它還在合法使用。反過來:**沒持鎖時絕對不准 kill 任何人的 dev server**。
   - 跑完務必確認自己的 server 已結束,不要留孤兒卡住下一個 lane。
   - typecheck / lint / unit test 不受此限,可並行(實測 8 核 load 32 時
     2061 個 unit test 仍全數通過)。
   - E2E 逾時失敗時先比對是否落在已知的資源競爭 flaky 家族(`admin-e2e`、
     `admin-analytics-e2e`、`admin-knowledge`、`admin-roles` 的 30s
     navigation timeout),不要誤判成自己 story 的回歸;但**也不得因此直接
     宣稱綠燈**,必須在持鎖且機器不忙時重跑到真的過。
6. 本檔完成所有 39 個 story 並 merge 後刪除。

## 6. 進度勾選

- [ ] W1:S034 S035 S036 S037 S039 S043 S044
- [ ] W2:E02-S032 S033 S034 E04-S048 S047 E11-S026 E13-S021
- [ ] W3:E04-S041 S042 S043 S044 E13-S019
- [ ] W4:E01-S021 S022 S023 S024 S025
- [ ] W5:E03-S040 S042 E12-S031 E03-S041 E03-S045
- [ ] W6:~~E13-S018~~ ✅(129b730) E01-S029 E01-S028 E12-S030 E01-S026
- [ ] W7:E13-S020 E03-S038 E01-S027 E01-S030 E03-S046
