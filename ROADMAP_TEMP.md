# 開發路線圖(暫存,全部完成後刪除本檔)

產生日期:2026-08-28。依據 `docs/stories/PROGRESS.md`(進度唯一真相)與各 story
備註欄的 HARD 依賴整理。**本檔只是排程輔助,狀態仍以 PROGRESS.md 為準。**

## 0. 現況摘要

- 總計 220 story,已 approved 179,`blocked-team-b` 1(E05-S024,等 Team B E06-S030,不排),
  `todo` 40。
- 40 個 todo 中 **E04-S037 屬 Team B**(硬體/模型環境,L3 需使用者手動),不排入 Team A 路線圖。
  → **可排程 39 個**。
- **2026-08-28 追加**:使用者裁示新增 `E04-S049`(`apps/api` bootstrap 順序修正,
  W3 於 E04-S042 之前插隊)→ **可排程 40 個**,PROGRESS.md 總數 220 → 221。
- **2026-08-28 再追加**:總指揮依同一授權新增 `E04-S050`(E04-S049 沒修完——domain
  plugin 無條件註冊是第二個獨立成因)→ **可排程 41 個**,總數 221 → 222。
- **2026-08-28 第三次追加**:W2 在 E04-S048 掃描真實路由表時發現 `hostRequireSession`
  快照綁定缺陷(真實 session 對 conversation routes 一律 401),經總指揮逐行覆核
  屬實 → 新增 `E04-S051`,**阻擋 E03-S038,W3 優先於 E04-S044/E04-S050 執行**。
  → **可排程 42 個**,總數 222 → 223。
- **2026-08-28 第四次追加**:sandbox seeder registry(E02-S032 建)至今零 production
  呼叫端,registry 註解明文指定由 E04-S041/S042 接線但未完成 → 新增 `E04-S052`
  (W3),**阻擋 E03-S038 的核心 AC**。→ **可排程 43 個**,總數 223 → 224。
- **2026-08-28 第五次追加**:W1 實測發現 sandbox 多 seed 了訊息,與既有 264 個
  E2E 的既定契約(有對話、無訊息)不符 → 新增 `E04-S053`(W3),同樣阻擋
  E03-S038。→ **可排程 44 個**,總數 224 → 225。
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
| **L1 api-client 主幹** | W1(2026-08-28 加派 **E01-S022**,見下方註)| E03-S034 → E03-S035 → E03-S036 → E03-S037 → E03-S039(← E01-S023/S024 已 merge) → E03-S043(← E03-S041) → E03-S044(← S038、E04-S044、E12-S031) |
| **L2 Auth 後端** | W2 | E02-S032 → E02-S033 → E02-S034 → E04-S048 → E04-S047(← E13-S018) → E11-S026(← E03-S035、E03-S038) → E13-S021 |
| **L3 Conversations 後端** | W3 | E04-S041 → **E04-S049(插隊)** → E04-S042 → E04-S043 → **E04-S051(最優先,擋 E03-S038)** → E04-S044 → **E04-S050** → E13-S019 |
| **L4 M3 前端** | W4 | E01-S021 → ~~E01-S022(改派 W1)~~ → E01-S023 → E01-S024 → E01-S025(最後,可延後到 L1 的 S043 之後) |

> **2026-08-28 加派**:W1 的 S039/S043/S044 全部卡在 W4 的 M3 serial chain
> (S039 與 E01-S023/S024 有檔案交集),W1 因此閒置。E01-S022 的 spec 明文
> 標示 HARD 依賴「無」、與 E01-S021 只在 `globals.css` **不同區段**交集,並
> 給出協調規則「先合併者定義 `--font-*` 變數,後者引用」——是為平行開發設計
> 的。故將 **E01-S022 改派 W1**,與 W4 的 E01-S021 同時進行,讓 E01-S023
> (需 S021+S022 皆 merge)提早解鎖。字型檔已備妥於
> `/data/python/AI_KM-assets/fonts/`。
| **L5 語音** | W5 | E03-S040 → E03-S042 → E12-S031 → E03-S041(← E03-S034) → E03-S045(← E03-S038) |
| **L6 基礎設施 / 安全** | W6 | E13-S018 → E01-S029 → E01-S028 → ~~E12-S030(改派 W5)~~ → E01-S026 |

> **2026-08-28 加派**:W5 做完 E03-S041 後 lane 只剩 E03-S045(等 E03-S038),
> 而它的兩個 in-progress(E12-S031、E03-S041)證據都卡在 **E12-S030**。把
> E12-S030 改派給剛做完 E12-S031 的 W5——它有 ASR domain 脈絡,且完成後
> **一次解開三個 story 的證據鏈**。與 W6 的 E01-S028 僅在根 `.gitignore`
> 交集(不同行),W6 屆時 rebase 即可。
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
   **2026-08-28 事故後強化(強制)**:`flock` 必須是**單一 Bash 呼叫內的單一
   指令**,把「查 port → 清孤兒 → 跑測試 → 收尾」全部包在同一個 `flock` 的
   子指令裡:

   ```bash
   flock -w 3600 /data/python/AI_KM-worktrees/.e2e.lock bash -c '
     echo "<lane> pid=$$ $(date -Is)" > /data/python/AI_KM-worktrees/.e2e.owner
     ss -ltnp | grep -E ":300[01]"   # 有 listener 才清
     pnpm test
     rm -f /data/python/AI_KM-worktrees/.e2e.owner
   '
   ```

   - **絕對不可**用 `exec 200>lock; flock 200` 然後在**另一個 Bash 呼叫**裡跑
     測試——Claude Code 的 Bash 工具**不保留 shell 狀態**,前一個呼叫的 shell
     一結束,鎖就釋放了,你會在毫無自覺的情況下無鎖執行。
   - **手動啟動 dev server 時必須用 `trap cleanup EXIT` 保證收尾**(2026-08-28
     W4 事故的真正根因):若腳本用了 `set -euo pipefail`,中間任何一步非零退出
     會讓腳本**提前結束、跳過 stop server 那行**,而 flock 隨腳本結束就釋放
     ——dev server 於是在**無鎖狀態下裸奔**,變成別人眼中的孤兒。Playwright 自
     管 webServer 的情況不受影響,但只要你自己 `&` 起 server 就一定要 trap:

     ```bash
     flock -w 3600 /data/python/AI_KM-worktrees/.e2e.lock bash -c '
       set -euo pipefail
       cleanup() { kill "${SRV:-}" 2>/dev/null || true; rm -f /data/python/AI_KM-worktrees/.e2e.owner; }
       trap cleanup EXIT
       echo "<lane> pid=$$ $(date -Is)" > /data/python/AI_KM-worktrees/.e2e.owner
       pnpm --filter @ai-km/web dev & SRV=$!
       <做事>
     '
     ```
   - **🔴 flock 的鎖跟著「開啟的檔案描述子」走,會被子行程繼承(2026-08-28
     實際發生的自我死結)**:在鎖內啟動的長壽命 process(手動 `next dev`)
     即使 `flock` 本身已結束,**只要它還活著就繼續持有鎖**。當天 W4 手動起的
     `next dev` 存活 32 分鐘,把鎖一直握著,而 **W4 自己排隊中的 `pnpm test`
     就卡在自己身後 30 分鐘**,W1 又卡在 W4 後面——一個人的殘留 process 讓
     兩條 lane 同時停擺,而且從 `flock -w 3600` 的角度看起來只是「還在排隊」,
     完全不像故障。
     因此:**絕對不要在鎖內手動啟動會存活到臨界區之外的 server**。
     `trap cleanup EXIT` 不足以防這件事——trap 若因任何原因沒跑到,鎖就永久
     卡住。Playwright 自管的 webServer 沒有這個問題(隨測試結束而死)。
   - **更省事的替代方案**:人工視覺確認/smoke 這類不需要跑既有 E2E 的工作,
     直接用**非 3000/3001 的丟棄式 port**(如 `PORT=3910 pnpm --filter @ai-km/web dev`),
     完全不必搶鎖,也不會擋到其他六條 lane。W1(E03-S035 用 3910)與 W5
     (voice harness 用 random port)都是這樣做的。
   - `.e2e.owner` 是**可觀測的所有權宣告**。動手 kill 任何 process 前先讀它:
     若檔案存在且**不是你自己**,代表鎖語意出了問題 → **立刻停手、回報總指揮,
     不准 kill**。若不存在或是你自己,才適用下面的孤兒判定。
   - 兩種 flock 寫法對**同一個 inode** 是真互斥(2026-08-28 以 `fuser`/`lsof`
     實測確認 fd 9 與 fd 200 兩種風格掛在同一 inode 上),語法差異不影響互斥性;
     出事的原因是**跨 Bash 呼叫導致鎖提早釋放**,不是語法。

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

## 5-septa. 🔴 推 main 只能用絕對路徑,**絕對不要用 `origin`**

七個 worktree 與 `/data/python/AI_KM` **共用同一個 `.git`**,而那個 `.git` 的
`origin` 指向使用者的 GitHub(`https://github.com/pollux0971/ai_km_system.git`),
**不是**這個 worktree 群共用的本地 `main`。

```bash
git push /data/python/AI_KM HEAD:main     # ✅ 唯一正確
git push origin HEAD:main                 # ❌ 推到 GitHub,不是本地 main
```

**這種錯誤完全靜默**:`git push origin HEAD:main` 會成功、exit code 0、
`git status` 乾淨,但你的 commit 進了 GitHub 那本帳,本地 `main` 完全沒動,
其他 lane 讀不到。2026-08-28 W3 的 E04-S050 就這樣分岔了兩次才被發現
(是總指揮在驗收時比對 `git merge-base --is-ancestor` 才抓到)。

**每次 push 後必須驗證**,不要只看指令有沒有噴錯:

```bash
git fetch /data/python/AI_KM main && \
  git merge-base --is-ancestor HEAD FETCH_HEAD && \
  echo "PUSH 確認成功" || echo "PUSH 沒進去"
```

開工前也花 10 秒自查一次 `git remote -v`,確認你心裡想的 remote 是哪一個。

**GitHub 那本帳目前落後且已分岔**,總指揮未經使用者同意不會往那邊推——
**任何 lane 都不要嘗試同步它**,那是對外動作。

## 5-hexa. 已知環境限制:jsdom + `FormData` 含 `Blob` 會永久 hang

W5 於 E03-S041 以最小重現腳本驗證:**在本 repo 的 vitest + jsdom 環境下,只要
`FormData` 裡有任何一個 `Blob`(即使 0 byte),把它包進 `Request` 之後呼叫
`.formData()` / `.text()` / `.arrayBuffer()`,甚至手動讀 raw stream,全部會永久
hang 且不丟例外。** 純字串 FormData 完全正常。補 `Blob.prototype.arrayBuffer`
的 polyfill(E03-S040 用過的繞法)無效,問題更深層。

**繞法**:在 openapi-fetch 真的建構出那個 Request 之前攔截,例如
`vi.spyOn(apiClient.transcriptions, "POST")`。**不要**把時間花在讓 jsdom 真的
處理 multipart。

**影響誰**:任何在 jsdom 下驗證檔案/音檔上傳的測試。**真實瀏覽器(Playwright)
沒有這個問題**,所以 `fake-api.ts` 的 multipart handler 仍應完整寫好,留給
E03-S038 / E03-S044 的真實 E2E 使用。

## 5-deca. 🔴 `.e2e.lock` 只保證 port 互斥,**不保證 CPU 獨佔**

2026-08-29 W7 在 E01-S027 的量測中證實:即使單一 lane 把自己的
`playwright.config.ts` 調到最好,只要同時有其他重負載,flaky 就會復發,而且
**失敗集合每次都不同**(v3 那輪有 ~15 支「前兩輪從未失敗過」的 spec 中箭,
含 `login.spec.ts` 本身),清一色 `page.goto` 30 秒逾時。

**兩個不同來源的競爭**:
1. **本專案其他 lane** 的 build / typecheck / 全量 unit——鎖管不到。
   → **規則**:持有 `.e2e.lock` 期間 = **整台機器保留給 E2E**。其他 lane 請
   暫停 build、`pnpm test`、全量 typecheck 等 CPU 重活;唯讀工作(讀 spec、
   寫 EVIDENCE、規劃)不受限。
2. **完全不同的專案**——2026-08-29 實測發現 `/data/python/na-wt/story-63-*`
   (nightmare-assault 專案的平行 worktree)同時在跑多個 `pytest` 套件,
   單一 process 就吃掉 60–72% CPU,load average 一度達 **27(8 核機器)**。
   **這完全不在本專案的控制範圍內**,任何 flock 設計都管不到。

**因此:任何 flaky / 效能相關的 AC,量測時必須記錄當下的 load average**,並且
只在機器安靜時取得的數字才算數。在 3x 超載下量到的失敗集合是雜訊,不是證據。

## 5-nona. 🔴 跑 E2E 前必須「暖機」——Next dev 是按需編譯

**症狀**:全量跑的**最前面**連續數個 spec 全部卡在同一步(通常是
`login()` 的 `getByLabel('帳號')` 或首個 `page.goto`)30 秒逾時,後面的
spec 卻正常。看起來像後端掛掉或大規模回歸,其實兩者都不是。

**根因**:Playwright 的 `webServer` 只等到 **port 開始監聽**就視為就緒,但
Next.js dev server 是**按需編譯**——第一次請求某條路由時才 compile。這台機器
同時有多條 lane 在跑時,首次編譯很容易超過 Playwright 的 30 秒逾時,於是最前面
幾個 spec 全滅。

**2026-08-28 W6 的對照證據**:pre-flight 兩項(`.api-version` 相符 +
`:4000` health 200)**都通過**之後,同一批 spec 仍然從 `[1/273]` 起卡在登入表單
——證明與共用 API 無關,是冷編譯。

**修法**:在 `flock` 內、`playwright test` **之前**加暖機迴圈:

```bash
for port in 3000 3001; do
  for i in $(seq 1 90); do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$port/login" || true)
    [ "$code" = "200" ] && { echo "port $port warm after ${i}s"; break; }
    sleep 1
  done
done
```

**這是純操作步驟**,不動任何 story 檔案,任何 lane 都可以立刻採用。

**對 E01-S027 的意義**:那 3 支長期「已知 flaky」(`admin-e2e`、
`admin-analytics-e2e`、`maintenance-e2e`)全部是導航/載入逾時,**極可能是同一個
冷編譯根因**,而不是測試本身不穩。W7 做 E01-S027 時應先驗證這個假設——若成立,
該 story 的解法是「webServer 就緒判定改成等真實回應而非等 port」,而不是去改那
三支 spec。

## 5-penta. 共用 apps/api(`:4000`)—— 全域單點,跑 E2E 前必檢查

七條 lane 的 E2E 登入都經由 web dev server 的 `/api/v1` rewrite 打到**同一個**
apps/api:掛在 `/data/python/AI_KM/apps/api`(總指揮 checkout,內容 = main)的
`tsx watch src/main.ts`。**它不屬於任何 lane,沒有健康檢查。**

**🔴 `health=200` 不代表它跑著最新的 main。** 為了穩定性,總指揮已把它從
`tsx watch` 改成**非 watch 模式**——它不再隨 main 變動自動重啟,所以任何影響
`apps/api`/`services/*` 的 merge(例如 E04-S053 改 sandbox seeder 註冊)**必須
由總指揮手動重啟才會生效**。2026-08-28 W4 因此對著舊碼白跑一輪 264 個 E2E。

**版本查驗**——總指揮每次重啟後把當時的 main commit 寫進
`/data/python/AI_KM-worktrees/.api-version`,跑 E2E 前比對:

```bash
API_VER=$(cat /data/python/AI_KM-worktrees/.api-version 2>/dev/null)
if [ "$API_VER" != "$(git rev-parse main)" ]; then
  BACKEND_DIFF=$(git diff --name-only "$API_VER" main -- apps/api services db contracts | head -1)
  if [ -n "$BACKEND_DIFF" ]; then
    echo "API 落後,且差異涉及後端 — 回報總指揮重啟後再跑"; exit 1
  fi
  echo "API 落後,但差異僅文件/前端 — 可繼續"
fi
```

**不要死板比對 SHA**(W6 於 2026-08-28 指出並改良):總指揮會頻繁 commit
`ROADMAP_TEMP.md` 與 `docs/`,若嚴格要求 SHA 相等,每次文件 commit 都會誤擋所有
lane。正確判準是「`.api-version` 到 `main` 之間的差異**有沒有碰到後端**」
(`apps/api`、`services`、`db`、`contracts`)——沒碰到就可以繼續,並在 EVIDENCE
記錄這個判斷。

跑任何 E2E 前先確認:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4000/v1/health
```

`200` 才跑。`000`/refused → **回報總指揮,不要自行重啟別人的 process,也不要
把測試結果當成自己的回歸或 flaky。**

**總指揮維護該 process 時一律先拿 `.e2e.lock`**(2026-08-28 立):對它的任何
重啟都會讓正在跑的 E2E 從中途失去後端,產生大規模、看起來像回歸的紅燈。當天
W1 一輪 32.8 分鐘的全量測試就是這樣被毀掉的(224 紅,連 `login.spec.ts`、
`smoke.spec.ts` 這種完全不碰對話的測試都失敗)。持鎖維護等於昭告「共用資源
正在被動」,lane 看到鎖被佔就不會開跑。

**已知失效模式二:依賴不同步。** 共用 API 跑的是總指揮 checkout 的程式碼,但
七條 lane 各自在自己的 worktree `pnpm install`。當某個 merge 進來的 story 新增
了 workspace 依賴(例:E04-S044 為 `services/conversation` 加 `fastify-plugin`),
總指揮的 checkout 不會自動補上,`tsx watch` 一重啟就 `ERR_MODULE_NOT_FOUND`。
注意:普通 `pnpm install` 會回報 "Already up to date" 卻仍缺連結,**要用
`pnpm install --force`**。

**2026-08-28 事故**:該 process 於當日 06:29 以 **snap node** 啟動;snap node
之後壞掉,於是 `tsx watch` 每次因 main 更新要重啟子行程時,spawn 的都是跑不起來
的 snap node。它變成「**父行程活著、零子行程、不監聽**」的殭屍——`ps` 看起來完全
正常,而所有 lane 的 E2E login 一律 30 秒逾時,症狀是「通用 timeout、無內容斷言
失敗」,極易誤判為負載型 flaky 或自己的回歸。已用正常 node 以 `setsid` 重啟。

**已知副作用**:它 watch 的是 main,**每次有 lane 推 main 就重啟**,那幾秒的請求
會 ECONNREFUSED。全量 E2E 中的零星連線失敗先複查是否撞上別人 merge。

**此單點於 W7 的 `E03-S038` 完成後消失**(Playwright 自管 apps/api webServer +
每輪獨立 tmp sqlite)。本次事故是該 story 最好的動機佐證。

## 5-quater. 跨 story 的「必要且純加法」擴充(總指揮 2026-08-28 裁示)

下游 story 開工後常發現:要達成自己的 AC,**技術上必須碰一個不在自己允許清單
內的檔案**,而那個改動本身極小、純加法、對既有行為零影響。全部退回開新 story
會癱瘓節奏,全部放行則等於取消範圍紀律。判準如下,**五條全部成立才可放行**:

1. **不做就無法達成本 story 的 AC**,且已實際試過替代方案並證明不可行
   (要在 EVIDENCE 寫出試過什麼、為什麼不行)。
2. **純加法**:新增可選參數／新增欄位／新增一個字串到清單。不得改變任何
   既有公開行為、簽名語意或預設值。舊呼叫方零影響。
3. **零商業邏輯**:機械性擴充或轉交既有資料,不引入新規則、不做新判斷。
4. **被碰檔案所屬 story 的既有測試零修改且全綠**(新增測試可以,修改不行)。
5. **雙向留痕**:本 story 的 EVIDENCE 記錄這是跨 story 擴充及理由;**同時**
   在被碰 story 的 EVIDENCE 檔尾附一行說明「本檔描述的模組已由 EXX-SYYY
   加入 <什麼>」,讓已 approved 的證據不會與實際程式碼脫節。
   (先例:E11-S026 的 DoD 本來就要求回頭在 E11-S023 的 EVIDENCE 補一行。)

**任一條不成立 → 不是擴充,是越界**:退回開新 story(如 E04-S049/E04-S050)
或轉 BLOCKED 回報。**特別注意**:「順手把鄰近邏輯也改一下」「反正只有我在用」
「改一下既有測試就過了」一律不適用本條。

已依此放行的案例:
- W5 / E12-S031:`apps/api/package.json` 加一行 workspace 依賴(否則允許清單
  內的「`server.ts` 註冊一行」在 pnpm workspace 下 import 無法解析)。
- W5 / E03-S041:`lib/voice/recorder.ts` 新增可選 `onAutoStop` callback
  (E03-S040 的自動結束把錄音結果 fire-and-forget 丟棄,下游拿不到)。
- W7 / E13-S020:`packages/api-client` 的 `SPEC_NAMES` 加 `"analytics"`
  並重跑 codegen(E13-S018 契約已凍結,但 codegen 未接上)。

## 5-ter. main 的 gate 基準線(2026-08-28,W7 持鎖實測)

對應 main `d1e8286`(含 E03-S034 的 turbo.json 變更),**在持鎖、無 port 互搶、
機器負載正常的條件下**跑出來的基準:

| Gate | 數字 |
|---|---|
| `turbo run typecheck --force` | 23/23 |
| `turbo run lint --force` | 23/23 |
| unit(全 package 合計) | **2101/2101 全綠** |
| E2E(264 spec) | **261 passed / 3 failed**,6.9 分鐘 |

**那 3 個失敗是既有的資源競爭型 flaky,不是回歸**,全部是 `page.goto` /
`page.waitForURL` **30000ms timeout**,沒有任何斷言內容不符:

- `admin-e2e.spec.ts`(E11-S025)—— 已在四輪基準中重複出現
- `admin-analytics-e2e.spec.ts`(E13-S017)—— 重複出現
- `maintenance-e2e.spec.ts`(E07-S025,`[web]` project)—— 同一家族的新成員,
  原本點名的 4 支清單裡沒有它

**怎麼用這個基準(嚴格,不得濫用)**:你的 story 跑出 E2E 紅燈時,只有**同時
滿足下列三條**才可歸類為既有 flaky,否則一律當作自己的回歸處理:
1. 失敗的是上列 spec 之一(或先前記錄的 `admin-knowledge`、`admin-roles`);
2. 失敗訊號是 30s 導航/載入逾時,**不是斷言內容不符、資料錯誤或型別錯誤**;
3. 持鎖、機器不忙時**隔離重跑仍能通過**。

「我猜是 flaky」不算證據。歸類為 flaky 時要在 EVIDENCE 附上隔離重跑的輸出。

**turbo.json 回歸已排除**:E03-S034 改了共用的 `turbo.json`,W7 以此基準確認
無回歸——理由是 task 圖若壞掉會出現 build/import/型別錯誤或功能性斷言失敗,
而不是清一色的導航逾時,且 typecheck/lint/2101 unit 全綠(這些對 `dependsOn`
極敏感)。此結論已回填 E03-S034 的 EVIDENCE。

**E01-S027 的原始素材**:上述三支 spec 的逾時就是 W7 後續 E01-S027
(E2E 穩定性強化、零 retries)要根治的對象。

## 5-bis. 待回補清單(不得因已 merge 就當完成)

有數個 story 的 `Definition of Done` / `Evidence Required Before Done` 要求
**別的 story 合併後才能取得的證據**。程式碼可以先 merge(下游需要),但
PROGRESS.md 狀態不得標 `approved`,必須留在 `in-progress` 並在備註寫明缺什麼、
等誰。**「AC 全綠」的 DoD 配上一條依賴別的 story 的 AC,等同於「不得標 Done」**
——2026-08-28 E03-S035 就是誤標 approved 後由總指揮更正的。

| Story | 缺的證據 | 解鎖條件 | 狀態 |
|---|---|---|---|
| E03-S035 | AC5(L5)跨分頁 session 存活 E2E | **E03-S038**(W7) | 碼已 merge(349ec67),`in-progress` |
| E03-S036 | AC6(L3)對真實 API 的最小 smoke | ~~E04-S041~~ ✅ **已於 6291c26 merge,無阻塞** | 開發中,可直接取證 |
| E03-S037 | AC8(L3)對真實 API 的 smoke | **E04-S043**(W3,進行中) | 碼已 merge(7f79991),`in-progress` |
| E03-S039 | AC7 | **E04-S044**(W3)+ **E03-S038**(W7) | 未開工;另因與 E01-S023/S024 檔案交集,須等 W4 先 merge |
| E03-S041 | L3 真實 ASR 輸出 | **E12-S031** L3 → **E12-S030** → **使用者錄音** | 未開工 |
| E03-S041 | 真實瀏覽器手動 demo + L3 真實 ASR(spec 綁在同一句)、AC10(L5) | **E12-S030** → **使用者錄音**;L5 需 **E03-S038** | 碼已 merge(b6f0844),`in-progress` |
| E12-S031 | AC8 L3:對 E12-S030 真實 fixture 關鍵詞命中率 ≥80%,**1650 與 4070 各一次** | **E12-S030** → **使用者錄音**;**4070 使用者已確認目前沒有** → 該輪記 `BLOCKED_DEPENDENCY` | 碼已 merge(60dff4f),`in-progress` |
| E12-S030 | AC6:1650 與 4070 **兩台皆需通過**才 Done;4070 若不可用記為 `BLOCKED_DEPENDENCY` 並附 1650 證據 | **使用者錄音**;**4070 使用者 2026-08-28 已確認目前沒有**,不得改成單機驗收 | 未開工 |

**掃描方法**(不要只 grep「不得標 Done」字面,會漏):對每個 spec 取
`## Evidence Required Before Done` 與 `## Definition of Done` 兩節,找其中出現的
`EXX-SYYY` 參照,再逐一判讀是「本 story 的證據要等它」還是「只是提到下游」。

**完成定義的順序約束**:E03-S035 不可能早於 E03-S038;E03-S039 不可能早於
E04-S044+E03-S038;E03-S041/E12-S031/E12-S030 這條鏈全部壓在**使用者的真實
中英夾雜錄音**上,是本批唯一無法由 AI 自行解除的阻塞。

## 6. 進度勾選

> **2026-08-29 現況**:225 story 中 201 approved、7 in-progress、1 blocked-team-b、
> 16 todo。**7 個 in-progress 全部是「碼已 merge、只差證據」**,而那些證據幾乎
> 都卡在同一件事:**拿不到一次機器安靜時的全量 E2E 量測**(見第 5-deca 節)。


- [ ] W1:~~S034~~ ✅(aae4fb3) ~~S035~~ 🟡待 S038 補證 ~~S036~~ ✅(7f79991) ~~S037~~ 🟡待 E04-S043 補證 **E01-S022(加派)** S039 S043 S044
- [ ] W2:~~E02-S032~~ ✅ ~~S033~~ ✅ ~~S034~~ ✅ ~~E04-S048~~ ✅ ~~E04-S047~~ ✅(f6c63f1) ~~E01-S028(加派)~~ ✅(57e9329) E11-S026 E13-S021
- [ ] W3:~~E04-S041~~ ✅(6291c26) ~~E04-S049~~ ✅(96f5fd0) ~~S042~~ ✅(cd401a3) ~~S043~~ ✅(27bb23d) ~~E04-S051~~ ✅(b3ebbb6) ~~S044~~ ✅(828f94a) ~~E04-S050~~ ✅(1e837aa) ~~E04-S052~~ ✅(cdca528) ~~E04-S053~~ ✅(a86abb8) ~~E13-S019~~ ✅(d24afa0) **lane 完成**
- [ ] W4:E01-S021 ~~S022(改派 W1)~~ S023 S024 S025
- [ ] W5:~~E03-S040~~ ✅(8472489) ~~S042~~ ✅(b96de46) ~~E12-S031~~ 🟡待補證(60dff4f) ~~E03-S041~~ 🟡待補證(b6f0844) ~~E12-S030~~ 🟡待錄音(b769185) ~~E01-S026(加派)~~ ✅(9e7561a) E03-S045
- [ ] W6:~~E13-S018~~ ✅(129b730) **E01-S029**(CSP nonce,使用者已裁示) ~~E01-S028(改派 W2)~~ ~~E12-S030(改派 W5)~~ ~~E01-S026(改派 W5)~~
- [ ] W7:~~S020~~ 🟡待補 5 支 E2E(基礎設施已就緒) ~~S038~~ 🟡待 AC1 裁示(259/271,12 個有文件根據的既有假設過時,非回歸) **E01-S027** S030 S046
