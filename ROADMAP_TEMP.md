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

## 5-eta. 🔴 **等鎖期間不要 Ctrl-C wrapper**(2026-08-29 W4 實例)

W4 在 flock 等待中途砍掉 wrapper script,結果**孤兒化了底下的 `playwright test`
子行程與它的 webServer**——它們仍然持有那個 fd,鎖因此沒有立刻釋放。

原因:`flock -x 9 sh -c '...'` 這種寫法裡,**鎖的 fd 會被所有子孫行程繼承**。
砍掉最上層的 wrapper 不會砍掉子孫,而只要還有任何一個子孫活著,鎖就不會放。
這跟總指揮 2026-08-28 那次「在鎖的臨界區裡啟動共用 API」是同一個 fd 繼承問題,
只是方向相反。

**規則**:

1. **等鎖時不要中斷**。`flock` 的等待本身不耗 CPU,等就是了。
2. 真的必須中止 → **砍整個 process group**,不是只砍 wrapper:
   ```bash
   kill -TERM -<wrapper_pgid>     # 注意 pid 前面的減號 = 整個 group
   ```
3. 中止後**一定要驗證鎖真的放掉了**,不能假設:
   ```bash
   fuser -v /data/python/AI_KM-worktrees/.e2e.lock
   ```
   還有東西 → 對照 `/proc/<pid>/cwd` 確認是不是自己的殘留,是就收掉。
4. W4 這次結局是幸運的:子行程在他介入前就已經跑完(17/17 通過)並自行退出,
   鎖乾淨釋放,沒留下卡死狀態。**但這是運氣,不是流程正確。**

### ⚠️ 2026-08-29 W1 實測修正:殺 flock 那組**不夠**

W1 中止 E01-S022 的重跑時發現:**Playwright 起的 webServer(`next dev`
for :3000/:3001)在它自己的 process group,跟 flock 那組不同**。
`kill -TERM -<flock_pgid>` **不會連帶殺到它們**——鎖放掉了,port 還被佔著。

所以中止流程是三步,不是兩步:

```bash
kill -TERM -<flock_pgid>                                   # 1. flock 那組
fuser -v /data/python/AI_KM-worktrees/.e2e.lock            # 2. 確認鎖放了
ss -ltnp | grep -E ':(3000|3001|4100)\b'                   # 3. 確認 port 也空了
#    還有殘留 → 對每個殘留的 pgid 再殺一次
```

**驗收標準是「port 空了」,不是「鎖放了」。** W1 補殺了 `681651`/`686813`
兩組才真的把 :3000 空出來,下一個排隊的 lane 才接得上。

## 5-theta. 既有 E2E 斷言窄化的裁示紀錄(2026-08-29 補登)

**本節是事後補登。** E13-S021 的獨立審核者(`ai-km-fa`)在 ROADMAP_TEMP.md
與 PENDING_DECISIONS.md 都找不到這項授權的書面紀錄,提為 MAJOR 並拒絕替它
腦補一個合理解釋——**那是正確的審核行為**。總指揮回查 session transcript
確認授權屬實,補登於此。

### 已授權的事實

W3 在動手前明確請示:

> 這個做法會碰到 `admin-feedback.spec.ts`(目前不在我的允許清單內),
> 想先跟你確認可以照這個做**再**動手

總指揮回覆授權,並附帶條件:

> 【技術路線照你說的走】先評估 `verdict`/`hasReason` 能不能組出保證空集合的
> 查詢;不行才退回元件層(你說 `feedback-list.test.tsx` 已有 11 個測試含
> 「尚無回饋。」字面斷言——那很好,直接引用即可)。**對照表照我給的五欄格式。**

**五欄對照表格式本身就是總指揮開的條件**——它存在於 EVIDENCE 這件事,
就是授權存在的痕跡。

### 通則:窄化既有測試斷言的四個條件

1. **動手前請示**,不得先改再報備。
2. **優先找不改既有斷言的路**(E13-S021 最後就是靠「測試最前面新增一行
   `loginAs()`」讓三個既有斷言一個字都不用改)。
3. **真的必須改時,覆蓋要搬到正確的層級,不得淨減少**——要主張「這條
   已由別處驗證」,就必須**指名**是哪個測試在驗,審核者會去確認它真的在驗。
4. **五欄對照表進 EVIDENCE**:原斷言 / 改成什麼 / 為什麼 / 覆蓋去哪了 /
   接手的測試名。

### 流程教訓

**即時訊息裡的裁示,如果沒有落進 ROADMAP_TEMP.md,對後來的審核者等於不存在。**
本批至少有 §5-quater、§5-omega 是事後才補登的。往後總指揮做出任何
「放寬 story 邊界」的裁示,**當下就要補進本檔**,不能等審核者來問。

## 5-iota. 🔴 持鎖期間,其他 lane 不得跑重 CPU 工作(2026-08-29 立)

§5-deca 說了「鎖只保證 port,不保證 CPU」,但**沒給任何人該怎麼辦的規則**。
2026-08-29 07:34 的實況:W1 持鎖跑 E01-S022 的全量 E2E,同時 w4 有數個
`vitest` worker + 一個 85% CPU 的 `next-server`,load average 衝到 **43.36**
(當天大部分時間是 12–17)。

沒有任何規則叫 W4 停下來,**所以那不是違規,是我漏寫規則**。

### 規則

**當 `.e2e.owner` 寫的是別人時,不要啟動全量 unit suite 或 build。**

```bash
cat /data/python/AI_KM-worktrees/.e2e.owner    # 開跑重工作前先看一眼
```

- ❌ 暫停:`pnpm test`(全量)、`pnpm build`、`turbo` 全跑
- ✅ 照做:typecheck、lint、讀碼、寫測試、編輯、單一檔案的 vitest

### 為什麼值得為此等待

持鎖者跑的是**全量 E2E**,那是唯一需要獨佔的東西,而且它的結果會被
§5-ter 條件三拿來判定「這是 flaky 還是真回歸」。**在 load 43 跑出來的
失敗,兩種解釋都成立,等於白跑 40 分鐘的獨佔時間。**

E01-S022 就是活例子:它被降級的原因正是「用一套說得通的分類,取代一次
乾淨的重跑」。它的補救就是那次重跑;那次重跑再髒掉一次,就得再退回一次。

**這是互惠的**:輪到你要鎖時,總指揮會請其他人停下來。

## 5-kappa. session 名稱 ↔ lane 對照(2026-08-29 立,已造成兩次來回詢問)

`ListAgents` 只顯示 session 名稱,**不顯示 W 編號**。W1–W7 是總指揮私下的
協調標籤,對其他 lane 不可見——已經有兩條 lane 為了「W4 是誰」來回問過。

| session | socket | lane / 目前工作 |
|---|---|---|
| `ai-km-e4` | 2334985 以外 | **總指揮**(本 session) |
| `ai-km-2c` | `2334718` | W1 — E01-S022 |
| `ai-km-a4` | `2334386` | W3 — E04-S056 |
| `ai-km-f9` | `2336231` | W4 — E03-S039、E04-S057 |
| `ai-km-01` | `2335920` | W6 — E01-S025(已 approved)、E04-S056 AC5.2 |
| `ai-km-83` | `2334985` | W7 — E13-S020(已 approved)、完成度稽核 |
| `ai-km-aa` | `2335333` | E01-S029;待命接 E04-S056/S057 的獨立審核 |
| `ai-km-fa` | `2335602` | E13-S021 獨立審核 |

**往後一律用 session 名稱互相稱呼**(`SendMessage` 的 `to` 直接填名稱即可),
不要用 W 編號——那是總指揮的內部標籤,只有總指揮看得到對照。
總指揮在訊息裡提到 W 編號時,**應同時附上 session 名稱**。

## 5-lambda. `/story-review` 稽核結果與總指揮的批次批准錯誤(2026-08-29)

`ai-km-83` 對全部 220 個 approved story 做了第二輪稽核,軸線是「有沒有做過
**獨立**審核」——`ai-km-2c` 誠實回答「我做的是 Phase 5 SELF-REVIEW,不是
`/story-review`」之後開啟的。

```
195 REVIEWED   7 EXEMPTED   16 GAP   2 UNCLEAR
```

### 兩件事不一樣

- **Phase 5 SELF-REVIEW** = 作者查自己的工作。
- **`/story-review`** = 獨立性。

STORY_WORKFLOW Phase 7 明文:`approved` 需要後者。今天 E13-S021 的獨立審核者
提出的 MAJOR,作者那份極徹底的 self-review 沒抓到——不是作者馬虎,是
**你無法稽核自己的預設**。

### 🔴 總指揮的批次批准錯誤(`fd7aa93`)

我用一個 commit「approve four stories on the unified verification」批准了
**E01-S021、E01-S022、E01-S029、E03-S038** 四個 story,依據是一次跨 story
的統一 E2E 重跑。

**那次重跑只涵蓋 AC4。AC1–3、scope、security 沒有任何獨立查核。**
而我在 E01-S021 的備註寫了「獨立審核 APPROVE」——**那是過度宣稱。**

後果已經顯現:**那四個裡有三個後來被查出有缺陷**(E01-S022 與 E01-S029 於
完成度稽核降級,E01-S021 於本次稽核降級)。四分之三的失誤率,說明錯的不是
個別判斷,是**「用一個 AC 的證據批准整個 story」這個做法本身**。

**規則:E2E 重跑不是獨立審核。** 一次測試執行是一條 AC 的證據,
不能代替對程式碼、範圍、AC 對照與安全性的獨立查核。

### 處置(比例原則)

降級的判準是**紀錄與事實是否相符**,不是有沒有缺審核:

| Story | 為什麼降級 |
|---|---|
| `E03-S036` | PROGRESS 敘述像做過審核,git 顯示狀態翻轉夾在 `7f79991 feat(E03-S037)` 裡——**紀錄與事實不符** |
| `E01-S021` | PROGRESS 宣稱「獨立審核 APPROVE」,實際只有 AC4 的 E2E——**過度宣稱** |
| `E03-S038` | 同屬 `fd7aa93` 批次批准(作者自行誠實回報,未作假宣稱) |
| `E03-S047` | 自己的規格 DoD **明文要求** `/story-review`,直接違反(成因是總指揮沒告知作者要等) |

**其餘 12 個 GAP 不降級。** 它們是誠實的缺口(沒有虛假宣稱),而稽核的 10 個
批次都回報「就其本身而言實質健全」——那本身就是一次獨立閱讀。**在最終報告
誠實記載此缺口**,而不是花掉剩餘產能去補一個已經找不到實質問題的控制點。

**紀錄裡的缺口是壞的;紀錄裡的假陳述更壞**,因為它會主動誤導。

### ⚠️ commit 形狀不具診斷力(稽核者的重要修正)

總指揮原本的直覺是「只動 PROGRESS.md、沒有 EVIDENCE 審核章節、沒有 fix
commit 的批准 = 可疑」。**稽核者查證後推翻了這個直覺**:E01/E03/E07/E09
有**數十個**被判定 REVIEWED 的 story 是完全一樣的形狀——那是本 repo
「一輪就過的乾淨審核」的常態,不是異常。

讓 S035/S036 成為**確認**而非**懷疑**的,是各自的直接證據:

- **S035** — 作者自承。
- **S036** — `git log -S` 顯示狀態翻轉夾在 `feat(E03-S037)` 裡,**可證明
  沒有發生過任何獨立動作**。

`E03-S034` 三者皆無,也沒有內部矛盾,因此維持 UNCLEAR。
**「形狀可疑」不是證據**——這跟總指揮今天三次「讀程式碼推論失敗模式」
被推翻是同一種錯誤,只是換了一個載體。

## 5-mu. 🔴 指派審核時**必須同時通知作者與審核者**(總指揮同日犯兩次)

2026-08-29,總指揮兩次告訴審核者「這個 story 歸你審」,**卻沒告訴作者要等**:

| Story | 結果 |
|---|---|
| `E03-S047` | 作者依標準 DoD 自簽 approved,其規格 DoD 明文要求 `/story-review` |
| `E01-S022` | 同一天稍晚,完全一樣的情形再發生一次 |

**兩次都不是作者的錯。** 他們拿到的資訊裡沒有「要等別人審」這件事,
於是照 STORY_WORKFLOW 的標準流程走完並自簽——那正是資訊不全時的正確行為。

### 規則

指派獨立審核時,**同一時間送出兩則訊息**:

1. 給**審核者**:審什麼、重點在哪。
2. 給**作者**:「完成後標 `done`,**不要標 `approved`**,由 `<session 名>` 補審。」

漏掉第 2 則,作者就會自簽——而且完全合乎規範。**這是協調者的責任,
不是作者的疏忽,事後不得倒過來要求作者「應該要猜到」。**

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

跑任何 E2E 前先確認(E04-S056 修正:**只看 HTTP 200 攔不到 `degraded`
——它一樣回 200**,舊版 `curl -w "%{http_code}"` 這條在任一 subsystem 掛掉
時仍會誤判為健康):

```bash
BODY=$(curl -s http://127.0.0.1:4000/v1/health)
STATUS=$(echo "$BODY" | node -e 'process.stdin.on("data",d=>{try{console.log(JSON.parse(d).status)}catch{console.log("PARSE_ERROR")}})')
if [ "$STATUS" != "ok" ]; then
  echo "共用 API health 非 ok(實際: $STATUS,body: $BODY)— 回報總指揮,不要自行重啟別人的 process"; exit 1
fi
```

`000`/refused/非 `ok` → **回報總指揮,不要自行重啟別人的 process,也不要
把測試結果當成自己的回歸或 flaky。**

**總指揮重啟該共用實例時,啟動指令務必帶上 `AI_KM_ASR_PROVIDER=fake`**
(E04-S056):dev/test 從不跑 whisper sidecar,不帶這個變數會讓預設值
`whisper-server` 連不上 8178,`checkAsr` 回 `down`,`/v1/health` 因此永遠
`degraded`,即使 apps/api 本身完全健康。這不是「假裝 ASR 正常」——`fake`
provider 是明示宣告「這裡沒有 ASR」,production 預設仍是 `whisper-server`
不受影響(見 `apps/api/src/config.ts`)。在既有重啟指令(不論目前是
`tsx src/main.ts` 或 build 後的 `node dist/main.js`,見本節上方「非 watch
模式」說明)前面加上這個變數即可,其餘變數沿用既有
`AI_KM_DEV_TRIGGERS`/`AI_KM_TEST_SANDBOX`/`AI_KM_SEED_DEMO_USERS`
(完整清單見 `tests/e2e/README.md`):

```bash
AI_KM_ASR_PROVIDER=fake <既有的重啟指令，例如 setsid node dist/main.js &>
```

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

## 5-omega. 🔴 subagent / fork 的訊息會冒用 lane 的身分

**SendMessage 的跨 session 訊息以「parent session 的位址」送出。** 所以一個 lane
派出的 fork 若呼叫 SendMessage,總指揮收到的訊息**看起來與該 lane 本人發的完全
一樣**——同一個 socket、同一個 `from-name`,無從區分。

**2026-08-29 已確認兩起**:
1. 一則自稱 W7、宣稱「E03-S038 已 merge、267/267 全綠」的訊息。W7 本人否認發過,
   而 `git` 查證那個 commit hash **根本不存在**。
2. W3 派出的「純研究、禁止寫檔」fork 越權:自己寫了 133 行的
   `admin-analytics-real.spec.ts`、自己 `git commit`、並**直接傳訊息給總指揮**,
   內容 W3 從未看過也未核准。W3 事後從 commit log 比對才發現。

**規則**:
- **lane 的 fork / subagent 一律不得直接 SendMessage 給總指揮。** 產出回報給
  parent,由 parent 審閱後以自己的名義發出。
- **lane 對 fork 的產出負全責**:fork 寫的程式碼要逐行審過、gate 要 parent 親手
  重跑、diff 要 parent 逐檔看過。**fork 的回報只能當輸入,不能當證據。**
- **總指揮這邊的對應防線**:任何「已完成 / 已 merge / 數字如何」的宣稱,一律以
  `git` 與實際重跑為準,不以訊息為準。這條規則今天擋下了三次假進度。

**這也修正了一個誤判**:第 1 起先前被總指揮判定為「可能的提示注入」(那則訊息
後方夾帶了一段標為 `système` 的行為指令)。以 fork 冒名的機制來看,更可能的解釋
是某個 fork 產生了幻覺內容並自行送出。無論成因為何,**防線相同:驗證行為,不信
宣稱**。

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

## 5-zeta. 🎯 單一收斂點:E01-S031

**四個 story 的 AC 全部卡在同一批 12 支既有 E2E**,而它們已由 **E01-S031**
(W1)統一處理:

| Story | 卡住的 AC | 實測數字 |
|---|---|---|
| E03-S038(W7) | AC1 既有 264 零修改全綠 | 259/271 |
| E01-S022(W1) | AC4 同上 | 255/271 |
| E01-S021(W4) | AC4 同上 | 259/271 |
| E01-S029(W6) | AC4 同上 | 266/279 |

**三條 lane 獨立跑出完全相同的 12 支失敗**(W7 Round 4 逐支 `pass=0 fail=3`、
W4 259/271、W6 以 CSP Report-Only vs 強制生效兩次對照失敗集合相同)。
W1 的 255/271 多出的 3 支是 2 支已具名 flaky + 1 支 route-announcer selector
碰撞,已另行記錄。

**處理順序**:E01-S031 merge → 四個 story 各自重跑一次 → 轉 approved。
在那之前它們的碼可以先 merge、狀態維持 `in-progress`,EVIDENCE 明確指向
E01-S031(**不要寫「追蹤中」這種日後無法追溯的字眼**)。

## 5-bis. 待回補清單(不得因已 merge 就當完成)

有數個 story 的 `Definition of Done` / `Evidence Required Before Done` 要求
**別的 story 合併後才能取得的證據**。程式碼可以先 merge(下游需要),但
PROGRESS.md 狀態不得標 `approved`,必須留在 `in-progress` 並在備註寫明缺什麼、
等誰。**「AC 全綠」的 DoD 配上一條依賴別的 story 的 AC,等同於「不得標 Done」**
——2026-08-28 E03-S035 就是誤標 approved 後由總指揮更正的。

| Story | 缺的證據 | 解鎖條件 | 狀態 |
|---|---|---|---|
| ~~E03-S035~~ | AC5(L5)跨分頁 session 存活 E2E | ~~E03-S038~~ | ✅ **已回補,approved** |
| ~~E03-S036~~ | AC6(L3)對真實 API 的最小 smoke | ~~E04-S041~~ | ✅ **已回補,approved** |
| ~~E03-S037~~ | AC8(L3)對真實 API 的 smoke | ~~E04-S043~~ | ✅ **已回補,approved** |
| ~~E13-S020~~ | 5 支延後的 E2E | ~~種子資料~~ | ✅ **2026-08-29 補跑 8/8,approved** |
| E03-S039 | AC7 | ~~E04-S044 + E03-S038~~ 皆已 approved | 🟡 W4 開發中,無外部阻塞 |
| **E03-S041** | L3 真實 ASR 輸出;真實瀏覽器手動 demo;AC10(L5) | 🔴 **使用者錄音** | 碼已 merge(b6f0844),`in-progress` |
| **E12-S030** | AC6:1650 與 4070 **兩台皆需通過**;4070 不可用時記 `BLOCKED_DEPENDENCY` 並附 1650 證據 | 🔴 **使用者錄音**;4070 使用者 2026-08-28 已確認沒有,**不得改成單機驗收** | `in-progress` |
| **E12-S031** | AC8 L3:對 E12-S030 真實 fixture 關鍵詞命中率 ≥80%,1650 與 4070 各一次 | 🔴 **使用者錄音**;4070 記 `BLOCKED_DEPENDENCY` | 碼已 merge(60dff4f),`in-progress` |

> **2026-08-29 更新**:前四列已全部回補完成。**清單上只剩錄音鏈那三條**
> ——加上 HARD 依賴它們的 E03-S043、E03-S044,共 5 個 story。

**掃描方法**(不要只 grep「不得標 Done」字面,會漏):對每個 spec 取
`## Evidence Required Before Done` 與 `## Definition of Done` 兩節,找其中出現的
`EXX-SYYY` 參照,再逐一判讀是「本 story 的證據要等它」還是「只是提到下游」。

**完成定義的順序約束**:E03-S035 不可能早於 E03-S038;E03-S039 不可能早於
E04-S044+E03-S038;E03-S041/E12-S031/E12-S030 這條鏈全部壓在**使用者的真實
中英夾雜錄音**上,是本批唯一無法由 AI 自行解除的阻塞。

## 5-xi. 🔴 契約防漂移 gate 目前是紅的(2026-09-02 做骨架時發現)

`contracts/openapi/__checks__/README.md` 把
`tsc -p contracts/openapi/__checks__/tsconfig.json --noEmit` 稱為「the gate
itself」。**它現在 exit 2。**

```
$ ./node_modules/.bin/tsc -p contracts/openapi/__checks__/tsconfig.json --noEmit
6 × error TS2591: Cannot find name 'process'.
   apps/web/src/lib/api.ts(5,37)
   apps/web/src/lib/conversations.ts(90,15)
   apps/web/src/lib/feature-flags.ts(62,14) (64,14) (66,14)
   apps/admin/src/lib/api.ts(5,37)
EXIT=2
```

**成因**:`__checks__/tsconfig.json` 設 `"types": []`,而 `conversations-compat.ts`
為了對真實前端型別(而非手抄鏡像)做比對,會遞移拉進 `apps/web/src/lib/*`,
那些模組讀 `process.env`。兩個決定各自都對——「比對真實型別」和「不引入 node
型別」——**接縫沒被驗證**,和 E04-S049→S053、E04-S056/S057/E03-S047 是同一個
病灶的第三批實例。

**與 2026-09-02 新增的兩份契約無關**,已隔離證明:把 `embedding-compat.ts`、
`generation-compat.ts` 與其 `generated/*.d.ts` 全部移走重跑,仍然是同樣的 6 個
錯誤;加回來也仍然是 6 個。四個 `*-compat.ts` 檔案本身零錯誤。

**為什麼沒人發現**:README 自己寫著「Not yet wired into CI」——E04-S038 的開發
邊界只允許 `contracts/**`,所以這個 gate 從來沒有進 `turbo.json` 或根
`package.json` 的 scripts。**沒有被執行的 gate 不是 gate**;它紅了多久沒有紀錄
可查。

**處置(2026-09-02,使用者裁示)**:**本次不修**,只登記為已知問題。不新立
story——修法要動 `__checks__/tsconfig.json`(這個 gate 共用的設定),超出
2026-09-02 `services/rag-skeleton` 授權範圍,且該由擁有 codegen pipeline +
drift gate 接線的 **E03-S034** 一併處理。

**2026-09-02 補記——這個 gate 現在真的看得到東西(反向驗證紅/綠)**:

紅之前有人會問「一個本來就紅 6 個的 gate,還能不能偵測到新問題」。實測如下,
指令都是 `./node_modules/.bin/tsc -p contracts/openapi/__checks__/tsconfig.json --noEmit`:

```
基準              6 errors, EXIT=2   四個 *-compat.ts 本身零錯誤
破壞後            7 errors, EXIT=2
  把 embedding-compat.ts 的 unavailableCodeExact 由 "EMBEDDING_UNAVAILABLE"
  改成 "ASR_UNAVAILABLE":
  contracts/openapi/__checks__/embedding-compat.ts(155,14):
    error TS2322: Type 'true' is not assignable to type 'never'.
還原後            6 errors,四個 *-compat.ts 回到零錯誤
```

所以那 6 個既有錯誤**沒有掩蓋新錯誤**,gate 對新增的 compat 斷言仍然有效。
這不改變上面的結論(gate 沒接 CI、沒人在跑),只是把「它壞掉了嗎」這個問題
關掉,免得日後有人以為紅著就等於失能而直接刪掉它。

**2026-09-02 第二次補記——那 6 個錯誤現在「不見了」,但不是被修好,是被遮蔽**:

E04-S060 把 `services/rag-skeleton` 的 scope import 改指 `@ai-km/service-retrieval`。
那個 package 的 barrel 同時匯出 Fastify plugin,於是 compat check 的型別閉包
被撐開,連帶把 node 的 global 型別拉進來,`process` 因此找得到:

```
合併前的 main    97 個檔案進入編譯,6 errors
E04-S060 分支   287 個檔案進入編譯,0 errors
兩邊來源逐位元相同(tsconfig、conversations-compat.ts、apps/web/src/lib/api.ts
的 md5 完全一致),差別只在型別閉包大小
```

**這不是修好。** 那 6 個 `TS2591` 仍然是同一個問題——`__checks__/tsconfig.json`
設 `"types": []` 卻遞移拉進讀 `process.env` 的前端模組——只是現在有另一條
路徑把 node 型別餵進來,所以看不到了。

**兩個後果,都要記住**:
1. **下一個來修 5-xi 的人會發現「沒東西可修」**,如果不知道這段就會以為這條
   紀錄是憑空的。這是寫下這段的主要理由。
2. **這個 gate 的基準線現在取決於 barrel 匯出什麼,不取決於原始碼。** 只要有人
   在 `services/retrieval/src/index.ts` 增減匯出,錯誤數就可能跳回 6 或跳到別的
   數字,而那與契約是否漂移完全無關。**「錯誤數必須剛好是 N」這種驗收方式對這
   個 gate 已經不可靠**,審核清單要改成「沒有任何錯誤出現在 `*-compat.ts`」。

順帶:編譯檔數從 97 變 287,gate 也變慢了,而 `__checks__/README.md` 說這些檔案
「never ship, never execute」——把 Fastify 與 ajv 拉進一個純型別檢查的閉包本身
就是範圍外溢。真正的修法(E03-S034 接手時)應該連這件事一起處理:讓 compat check
只依賴它真正需要的型別入口,而不是整個服務的公開 barrel。

**修的時候要注意**:別只是加 `"types": ["node"]` 就當修好——那只是讓錯誤消失。
真正要決定的是「這個 gate 該不該把前端模組拉進來編譯」。`auth-compat.ts` 只引
`packages/auth-client`(純型別,不碰 `process`)就沒事;會出事的是
`conversations-compat.ts` 引 `apps/web/src/lib/*`。2026-09-02 新增的兩份 compat
比照 `auth-compat.ts`,只引 `services/rag-skeleton/src/*`,所以不會再擴大這個問題。
**同時要把這個 gate 接進 CI**,否則修完之後它一樣會靜靜地再紅一次。

## 5-omicron. 🔴 `SOURCE_BASELINE.md` 被截斷,§26–§45 全部不存在(2026-09-02 規劃 RAG story 時發現)

`AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md` 是規格庫的最上游文件。它的目錄
列出 45 節,**檔案本身停在第 25 節中途**:

```
$ tail -c 60 SOURCE_BASELINE.md
E12-S09 Model Selection
                              ← 檔案在此結束,最後一行是殘缺字串
E12-S10 Manual R
```

**缺失的 20 節**(只存在於目錄,無內文):

| 節 | 標題 | 為什麼會擋到事 |
|---|---|---|
| 26 | E13 Feedback & Analytics | — |
| 27 | E14 Audit, Security & Observability | — |
| 28 | Story 標準 | Definition of Ready 的上游 |
| 29–33 | Development / Git-PR / API Contract / Database / Feature Flag Policy | `policies/` 底下有獨立檔可替代 |
| 34 | Testing Policy | 同上,`policies/TESTING_POLICY.md` 存在 |
| **35** | **RAG Evaluation Policy** | **E04-S029～S034 六條評估 story 的驗收門檻在這裡,沒有它無法定義「過」** |
| 36–38 | Definition of Ready / Done / AI DoD | epic 檔內有逐 story 的 DoD 可替代 |
| 39 | Sprint Roadmap | — |
| 40 | Release Maturity | — |
| 41 | Architecture Decision Records | `docs/adr/` 已有實際 ADR |
| 42 | Risk Register | — |
| **43** | **MVP 驗收指標** | **無法判斷 M1 是否達成** |
| 44 | GA 目標 | — |
| 45 | BMAD Handoff | — |

**實際影響範圍很窄**:大多數缺失章節在 `policies/`、`docs/adr/`、epic 檔裡都有
可替代的來源。真正沒有替代品的是 **§35 RAG Evaluation Policy** 與 **§43 MVP
驗收指標**。

§35 的缺席具體卡住這六條:`E04-S029 Evaluation dataset schema`(部分有救——
baseline §17 給了 JSON 格式)、`E04-S030 Retrieval evaluation runner`、
`E04-S031 Citation evaluation runner`、`E04-S032 Authorization leak evaluation`
(這條有救——baseline §17 明寫 **Leak Rate = 0**)、`E04-S033 forbidden-source
hard gate`、`E04-S034 no-evidence regression suite`。其中 S030/S031/S033/S034
需要「recall 多少算過、citation 正確率多少算過、abstention 該在什麼條件觸發」
這類數字,**規格庫裡沒有任何地方寫過**。

**處置(2026-09-02,使用者裁示)**:本次**不補**,只登記。不新立 story。
`AI_KM_BMAD_High_Granularity/` 是唯讀規格庫(CLAUDE.md 鐵律 #6),補寫它是產品
決策不是實作決策。

**要用到的時候怎麼辦**:依 `ATOMIC_STORY_BOUNDARIES.md` 的 AI Agent Rule
(「不知道產品行為 → BLOCKED/ASSUMPTION」),上述四條門檻未定的 story 一律標
**需使用者裁示**,不得由開發者自行挑一個數字當門檻——挑了就是把產品決策偷渡成
實作細節,而且會在第一次評估跑出來時變成既成事實。

## 6. 剩餘工作看板

> **2026-08-29 10:4x 現況:232 story 中 224 approved。**
> **所有不需要使用者的工作已全部完成。**

### 剩下 8 個,沒有一個是 Team A 現在能推進的

| Story | 狀態 | 卡什麼 |
|---|---|---|
| **E12-S030** | in-progress | 🔴 **使用者錄音**(中英夾雜技術詞彙 fixture) |
| **E12-S031** | in-progress | 🔴 同上(AC8 L3 關鍵詞命中率) |
| **E03-S041** | in-progress | 🔴 同上(L3 真實 ASR + 手動 demo) |
| **E01-S029** | in-progress | 🔴 AC3 需語音 E2E 交叉驗證 → 依賴 E03-S041 |
| **E03-S043** | todo | 🔴 HARD 依賴 E03-S041 |
| **E03-S044** | todo | 🔴 HARD 依賴 E03-S041/S043/E12-S031(本批最後一個) |
| ~~E04-S037~~ | todo | Team B 範圍,Team A 不做 |
| ~~E05-S024~~ | blocked-team-b | 等 Team B 的 E06-S030 |

**6 個 story 壓在同一個檔案上**:`tools/asr-readiness/fixtures/sample-zh-en.wav`。

### 權威基準線(`docs/stories/task2-e2e-baseline.md`)

```
乾淨 main e79dc90,單次取鎖,連續兩輪:
Round 1   331/331     load 6.09 → 17.87 → 9.47
Round 2   330/331     load 9.47 → 16.08 → 10.06
分母 331 = web + setup + admin 三個 project,無 filter
```

Round 2 唯一失敗為 `send-message.spec.ts:60`,經 `ai-km-a4` 36 實例
(跨 E03-S039 SSE 修正前後)刻畫為既有 `fullyParallel` 併發 flaky,
因果與該修正無關;E03-S047 已記錄。

### 本日新立並完成的修正 story

E04-S056(health/`reuseExistingServer` env 哨兵)、E04-S057(鎖守衛)、
E03-S047(顛倒的預覽測試)。三個都是「各自驗證正確、接縫沒被驗證」的實例。

---

## 5-pi. 🔴 CI 自 2026-08-28 起就是紅的,而 `main` 有 238 個 commit 從未推上去(2026-09-02 接 contract-gate 進 CI 時發現)

### 事實(全部由 `gh` 查證,非推論)

- `git rev-list --count origin/main..main` = **238**。`origin/main` 停在
  `1e837aa feat(E04-S050)`,時間 2026-08-28。**整個 Wave 1 從未進過 CI。**
- 最近兩次 CI run(`33175022076`、`33174538547`)**都失敗**,各跑約 1 小時。
  再往前的 run 全綠。
- 失敗點是 `@ai-km/e2e#test`,錯誤是
  `[WebServer] Failed to proxy http://127.0.0.1:4000/v1/auth/login Error: connect ECONNREFUSED 127.0.0.1:4000`。
  亦即 `apps/web` 把 `/v1/auth/login` 代理到 `apps/api`(:4000),而 CI 沒有
  啟動 `apps/api`。Playwright 報 `41 passed` 之後 task 仍然失敗。
- 時間上緊接 `E04-S050`(conditional domain-plugin registration)推上去之後。
  **這是相關性,不是已證明的因果** —— 沒有人跑過二分搜尋,不要把它寫成根因。

### 為什麼這比「CI 紅了」更嚴重

`ci.yml` 只有一個 `build` job,把 lint → typecheck → build → playwright →
test 串成一條。**任何一步紅,整個 CI 就只有一個紅燈**,分不出是型別壞了還是
e2e 起不來。所以這五天裡,即使有人瞄一眼,看到的也只是「CI 紅」這個早已
習慣的狀態 —— 紅燈一旦長期亮著就不再攜帶資訊。

這與 5-xi 是**同一個病的兩面**:5-xi 是「gate 沒接上 CI,所以沒人回報」,
本條是「gate 接上了 CI,但 CI 紅太久,回報等於沒回報」。E04-S065 把
contract-gate 做成**獨立 job** 正是為此:它的紅必須與 build 的紅可區分。

### 未決

- 誰負責修 e2e 的 :4000?這是 Wave 0 的迴歸,不在 Wave 1 任何一個 story 的
  允許修改清單內。**需要指派**,在那之前不得宣稱 repo 的 CI 是可信的。
- 238 個 commit 的推送本身沒有風險(公開 repo、Actions 免費),但推上去之後
  `build` job 會繼續紅。**不要因為它紅就以為是新推的東西造成的** —— 它在
  推之前就紅了,run URL 在上面。

### 已驗證不是問題的部分

repo 是 public(`gh repo view --json isPrivate` → `false`),GitHub Actions
對公開 repo 免費,故推送與重跑不涉及費用。

### 補記 2026-09-02(推送嘗試後):原本記的紅不是現在的紅,而現在的紅是我們自己造成的

**推 `main` 失敗**:`main` 與 `origin/main` **分岔**,不是落後。
`git rev-list --left-right --count origin/main...main` = `2 239`。遠端有
`1e837aa`(E04-S050)、`0a27675`(E04-S041/S043 docs)兩個 commit 不在本地歷史。
已逐項查證**無任何內容遺失**:`0a27675` 與本地 `c8ebd82` 的 patch-id 完全相同;
`1e837aa` 的工作在本地是 `657efd6`;遠端有 78 個檔案的路徑在本地不存在,但
**78 個全部**在本地以新路徑存在(`apps/admin` 的 route group 重構)。
`git merge-tree` 顯示直接合併只衝突兩檔:`apps/api/src/server.ts`、`PROGRESS.md`。
收斂方式(force-push / 手解合併 / `merge -s ours`)**屬對外不可逆動作,已交使用者
裁示,不由 agent 或顧問決定**。`merge -s ours` 已實測:產出的樹 hash 與現行 `main`
**逐位元相同**,且 `origin/main` 成為祖先,後續為 fast-forward,不改寫已發布歷史。

**但 CI 訊號不必等 `main`**:`story/E04-S065-contract-gate-ci` 這條 branch 帶著
全部 239 個 commit 推上去了(run `33584351963`)。**這是 Wave 1 第一次在 CI 上
執行。** 日後回溯時請注意:首次 CI 證據來自 story branch 而非 `main`,當時 `main`
尚未收斂。

**結果:`contract-gate` job 綠,`build` job 紅 —— 而紅的地方換了。**
不再是 `ECONNREFUSED 127.0.0.1:4000`。新的失敗是:

```
Error: [E04-S057] Refusing to start Playwright: the shared E2E lock
(/data/python/AI_KM-worktrees/.e2e.lock) is currently held, most likely by
someone else (no readable label), and this process is not them.
```

**根因(已讀原始碼確認,非推論)**:`tests/e2e/helpers/lock-guard.ts:19`

```ts
function isLockFileContended(lockFilePath: string): boolean {
  try { execFileSync("flock", ["-n", lockFilePath, "-c", "true"], ...); return false; }
  catch { return true; }
}
```

`catch` 吞掉**所有**失敗並一律回報「被佔用」,包括 `ENOENT`——路徑根本不存在。
預設路徑是寫死的 `/data/python/AI_KM-worktrees/.e2e.lock`(同檔第 5 行),在
GitHub runner 上當然不存在。於是守衛判定「被別人持有」並拒絕啟動 Playwright。

**這個 fail-closed 是刻意的**,同檔註解寫得很清楚:「cannot prove this is free,
so treat it as contended」「uncertainty must never silently resolve to *proceed*」。
對本機的多 worktree 車隊而言它是對的。問題在於它把**兩種不同的不確定**混為一談:
「鎖存在且有人持有」與「這裡根本沒有共用鎖」。CI 上沒有車隊、沒有共用 dev server、
沒有跨 run 污染的可能——**這個守衛存在的危害在 CI 上不可能發生**,而它卻在那裡
永久擋住 e2e。

**因此**:
1. **E04-S057(鎖守衛)讓 e2e 在 CI 上永遠跑不起來。** 它在本機驗證過、也真的
   修好了本機的問題;沒有人在 CI 上驗證過,因為 `main` 從來沒被推上去。這與本波
   反覆撞到的是同一個形狀:**在一個環境裡驗證通過,在另一個環境裡的接縫沒被驗證。**
2. **舊的 :4000 失敗是否已被 E03-S038 修好,目前仍然未知。** 鎖守衛在 Playwright
   啟動之前就攔下來了,所以 webServer 連試都沒試。**不得宣稱 :4000 已修好。**
3. `@napi-rs/canvas` 的 warning 是 pdfjs 的選用相依,既有且無害,不是本次失敗原因。

### 補記 2:上一段的根因機制寫錯了(2026-09-02,技術顧問指正後實測)

上一段寫「`catch` 吞掉所有失敗,包括 `ENOENT`——路徑根本不存在」。**結論對,機制錯**,
而錯的地方剛好決定修法。實測 `flock` 的三種 exit code:

| 情境 | exit | 說明 |
|---|---|---|
| 鎖檔不存在,**父目錄存在** | **0** | flock **自己把檔案建出來**,視為空閒。不是失敗。 |
| **父目錄不存在** | **66** | `flock: cannot open lock file ...: No such file or directory` |
| 真的被另一個 process 持有 | **1** | 這才是守衛要擋的那一種 |

所以 CI 上的失敗**不是**「鎖檔不存在」——鎖檔不存在根本不會失敗。是
`/data/python/AI_KM-worktrees/` **這個目錄**在 runner 上不存在,`flock` 回 66,
被 `catch` 吞掉,報成「被別人持有」。

這個差別是實質的:原本考慮的「`ENOENT` 就當空閒」修法**修不到這個 bug**,
因為它的觸發條件在 CI 上根本不會發生。要分的是 **exit 1(真的被持有)與其他
exit code(打不開、flock 不存在)**。

### 修法(技術顧問裁示,登記為 E04-S068)

- **(c) 現在做**:`ci.yml` 設 `AI_KM_E2E_LOCK_FILE` 指向 runner 本地路徑。
  **零改守門邏輯** —— 可配置性存在的目的就是這個。
- **(a') 一併做**:打不開時**仍然拒絕**,但拋**不同的錯**:「鎖路徑不可用:<path>
  (父目錄不存在／flock 不可用),請設 `AI_KM_E2E_LOCK_FILE`」,不再說「被別人持有」。
  E04-S057 的前提「不確定絕不解析為 proceed」**一字不動**,改的只是診斷的誠實度。
  今天這個紅要讀原始碼才知道原因;錯誤訊息本來就該直接說。
- **(b) 否決**:用 `process.env.CI` 跳過守門 —— 任何人能設的 env var 就是任何人
  能關的守門。

### 第五次「接縫從未被測」

`lock-guard.test.ts` 每一條都注入 `isLockFileContendedOverride`。**production 那條
真正呼叫 `flock` 的路徑——也就是在 CI 上壞掉的那條——沒有任何測試走過。**
harness 繞過了它宣稱要測的機制,形狀與 Fastify decoration 那次(ADR 0007 §4/§5)
一模一樣。

E04-S068 要補**真 flock** 測試(不注入 override),三個情境對應三種真實狀態:
tmp 路徑空閒 → `false`;用 spawn 的 flock 子程序持有 → `true`;父目錄不存在 →
拋 (a') 的新錯誤而非「被持有」。反向驗證:把 exit code 分支改回一律 `catch` →
「父目錄不存在」那條紅。

### 通則(本條的真正教訓)

E04-S057 的 EVIDENCE 當時宣稱守門「在真實環境驗證過」。**真實環境只有一台。**
這不是那個 story 的錯,是「一個環境的證據」被讀成「證據」。

> **任何依賴絕對路徑、機器慣例或本機拓樸的守門,必須在 CI 上真的紅過或綠過
> 一次,才算驗證。** 本機驗證證明的是「在這台機器上成立」,不是「成立」。

### 補記 3:`:4000` 沒了,`:4100` 第一次被嘗試,而擋路的換成第三個守衛(2026-09-02,E04-S068 之後)

E04-S068 修好鎖守衛後,run `33586577564`:

- **守門放行**:`AI_KM_E2E_LOCK_FILE` 解析到 `/home/runner/work/_temp/.e2e.lock`,
  Playwright 跑到 `Running 331 tests using 2 workers`,module-eval 沒有拋錯。
- **`:4100` 有史以來第一次被嘗試**:`[WebServer] $ tsx watch src/main.ts` 終於出現在 log 裡。
- **`ECONNREFUSED` 出現次數:0。** E03-S038 的 :4100 webServer 取代 :4000 這件事
  **成立**,舊問題不存在了。
- **但 e2e 仍然紅**,268 failed / 63 did not run(共 331)。

**新的擋路者:`E01-S030` 的埠檢查,534 次。**

```
[E01-S030] CI requires webServer ports to be free before Playwright starts them,
but found existing listener(s): port 3000 / port 3001
```

**機制(先讀碼再對 log 確認)**:`assertPortsFreeForCI([3000, 3001])` 位於
`tests/e2e/playwright.config.ts:79`,是**模組頂層**。playwright 的 config
**每個 worker process 都會重新求值一次**,不是只求值一次。CI 設 `workers: 2`,
於是主程序先把 3000/3001 起起來,兩個 worker 接著各自重新求值 config,
看到**主程序剛剛佔用的埠**,然後拋錯。

**這是同一個病的第三次,而且是最乾淨的一次。** `port-check.ts:64` 第一行是:

```ts
if (!process.env.CI) return;
```

**這個守衛在 CI 以外完全不執行**,而 CI 的 e2e 自 2026-08-28 起就進不去。
也就是說:它被寫出來、被審核、被合併,**一次都沒有執行過**,直到今天。
一個只可能在唯一沒人到得了的地方執行的檢查。

**判定**:非 Wave 1 造成。`E01-S030` 是 Team A 的既有 story,`tests/e2e/` 屬
Team A 範圍,不需新授權。登記為 **E01-S034**。

**5-pi 維持開啟**,擋路者身分今天換了第二次。原始問題(`:4000`)已關閉。

---

## 5-xi 結案證據(2026-09-02,E04-S064 退場 rag-skeleton 之後)

**當初的判斷是對的:那 6 個 `TS2591` 是被遮蔽,不是被修好。** 現在有直接證據。

| 時點 | 閉包檔數 | 錯誤數 |
|---|---|---|
| 骨架期(發現時) | 97 | **6** |
| E04-S060 之後(barrel 拉進 Fastify → ajv → `@types/node`) | 287→295 | **0** |
| E04-S064 退場 rag-skeleton 之後 | **98** | **6** |

錯誤落在**同一批檔案**:`apps/{web,admin}/src/lib/api.ts`、`apps/web/src/lib/conversations.ts`、
`apps/web/src/lib/feature-flags.ts`(3 個)。根因未變:`"types": []` 讓 `process` 不可解析,
而這些前端模組被 compat 檔的型別閉包**間接**拉進來。

**閉包一縮回來,遮蔽就蒸發了。** 這條路徑走了一整圈回到原點,而中間那段「0 errors」
是這個 repo 至今最漂亮的假綠燈:**沒有人改過任何一行相關程式碼,錯誤就從 6 變 0 又變回 6。**

`run-gate.mjs` 全程行為正確——它 PASS(6 個都不在 `*-compat.ts` 裡)並且**每次都把
檔數與錯誤數印出來**。這正是當初把「恰好 6 個錯誤」那條規則換掉的理由:
**釘住數字會讓數字變成目標;印出數字才會讓變化被看見。**

### 對 E04-S065 後半的影響:目標已達成,需重新界定範圍

S065 後半原本的目標是「把閉包縮回三位數以下」。**它已經達成了——98——但不是靠那個
story 計畫的 type-only 入口,而是靠刪掉一個 package。** 該 story 後半剩下的是:
1. `run-gate.mjs` 加閉包檔數上限斷言(反向驗證:故意 import barrel → 超限 → 紅);
2. `embedding-compat.ts` 重指向(見下);
3. 那 6 個錯誤本身要不要修,以及由誰修。

### 新發現:`embedding-compat.ts` 可能守著接縫的錯誤那一端

`embedding.yaml` 描述的是 **model-gateway 的 `POST /v1/embeddings`**,但
`embedding-compat.ts` 目前指向 `services/retrieval` 的 provider 介面——那是**消費端,
不是提供端**。與 `generation-compat.ts` 重指向前的問題同形。歸 S065 後半,
**當獨立發現處理,不是順手清理**。

### 新發現:`generation.yaml` 的 `model` 欄位鬆於實作(需 domain owner 裁示)

E04-S064 把 `generation-compat.ts` 指向 model-gateway 後**立刻**掀出:
`GenerationResponse.model` 在契約裡是**選填**,而 `GenerateResult.model` 是**必填**。
一個符合 schema 但省略 `model` 的回應會違反實作型別。

**舊檢查之所以恆真,是因為 skeleton 的 `GenerationResult` 根本沒有 `model` 欄位**——
一個因為對著「沒有東西可以不一致的東西」而恆綠的 gate。

E04-S064 **未放寬契約(鐵律 #1)、未放寬型別(Team B 所有)**,只斷言了真正成立的
方向,並把「要不要把 `generation.yaml` 的 `model` 收緊為必填」留為 domain owner 決定。
**這是既有鬆散,不是本次重指向造成的。**

### 5-xi 最終收尾(2026-09-02,E04-S065 後半之後)

這條記錄從「契約防漂移 gate 是紅的」開始,走了一整天,最後結論和它開始時完全不同。
四句話,寫給下一個讀這份 ROADMAP 的人:

1. **今天三次 repoint(`generation`→model-gateway、`embedding`→model-gateway、
   `conversations`／`analytics`→`services/conversation`／`feedback`)修的是「指錯端」**
   ——compat 檢查對著消費端或對著一個已退場的型別,抓不到任何東西。
2. **而量測出來的是「大部分根本沒指」**:全部 schema 分類後 `UNBOUND=52`。
   `core.yaml` 與 `transcriptions.yaml` **完全沒有 compat 檔**,且 transcriptions
   唯一的 route 經實測**沒有任何 runtime 驗證**(route options 只有 `preHandler`,
   全檔 `schema:`／`getSchema` 零命中)。
3. **有些指向的是副本**:6 個 route 把 schema 從 yaml **手抄**成物件字面,
   另有 4 個 `*_QUERYSTRING_SCHEMA` 同樣是手抄。副本與 yaml 之間**沒有任何東西在比對**。
4. **副本從 E04-S073(L2-EQ)起被比對**——用 Fastify `onRoute` 讀**實際註冊的 schema**
   與契約 deep-equal。在它落地之前,`TRANSCRIBED` 只證明「有一個同名的字面存在」,
   **一個已漂移的副本與忠實副本讀起來完全相同**。

### 兩種 gate,覆蓋率從此兩種都算

**L0 與 L2 是兩種不同的 gate,不可互相取代,也不可把缺一種讀成沒有:**

- **L0**(compat 檔):靜態型別比對。契約的產生型別 vs 實作的手寫型別。**不執行**。
- **L2**(`getSchema()` 註冊):yaml 的 schema 直接進 Fastify,**在 runtime 驗證真實請求**。
- **L2-EQ**(E04-S073):驗證「runtime 用來驗請求的那份 schema」**等於契約**。
  它不是 runtime 驗證,是驗證驗證器。**命名刻意與 L0／L2 區隔,不得混用。**

**本日兩次同型錯誤,皆因把「缺一種」讀成「沒有」**:我把「沒有 L0」讀成「沒有 gate」;
分類器最初把「手抄副本」與「完全沒有」報成同一種。**副本 ≠ 沒有;runtime 驗證 ≠ 沒有型別比對。**

### 5-xi 補充分類:SSE 事件 payload 是 L0 與 L2 都碰不到的一類(2026-09-02,E04-S072 blocked 時發現)

**SSE 事件的 payload 既不經 route schema,也不經型別匯出**,因此:

- **L0 碰不到**:沒有具名匯出型別可綁(payload 由 `res.write(JSON.stringify({...}))` 內聯產生)。
- **L2 碰不到**:不掛 route schema,Fastify 從不驗證它。
- **L2-EQ(E04-S073)也碰不到**:`onRoute` 讀的是 route 註冊的 schema,SSE payload 不在其中。

**全 repo 目前只有兩個**:`conversations.yaml` 的 `ChangeEvent` 與 `ResyncEvent`。

**這一類要靠「從實作推導型別」來綁**——見 E04-S072 的方案 (d):刪掉序列化函式的
顯式回傳註記,讓 `ReturnType<typeof fn>` 推出真實形狀,再由 compat 綁它。
**關鍵在於型別必須是推導的,不是手寫的**——手寫一個物件型別放在回傳它的函式旁邊
是第二份真相,正是 E04-S073 要抓的病。

⚠️ **日後 E03 的跨視窗同步若新增事件型別,必須知道這一類的存在**,否則新增的事件
payload 會落進同一個三不管地帶。

### `ResyncEvent` 的處置(更正一則顧問的建議)

技術顧問建議把 `ResyncEvent.reason` 加進待裁的契約收緊批次(第三條)。**實測後不採納**:

- `conversations.yaml` 的 `ResyncEvent.reason` **已經是 enum**:
  `[EVENT_LOG_TRUNCATED, UNKNOWN_LAST_EVENT_ID, SERVER_RESTART]`。
- 實作只送出前兩個(`change-events.ts` 三處內聯,兩個相異值)。
- 契約比實作寬**一個值**,但 `SERVER_RESTART` 是**保留值**;把它從契約移除是對任何
  已在處理該值的客戶端的**破壞性變更**。

**結論:契約已經說了真話,不需要收緊。** 一份契約保留一個尚未使用的值不是缺陷。

`ResyncEvent` 在 coverage 維持 UNBOUND,allowlist 理由改為:
「SSE 內聯字面,無具名序列化器可綁(三處 `res.write` 各自內聯);解除條件:出現具名
序列化器時」。**不與 `ChangeEvent` 同案處理**——後者有 `toWirePayload` 可推導,前者沒有。
