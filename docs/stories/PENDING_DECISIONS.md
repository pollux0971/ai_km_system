# 待使用者批示的決策(Pending Decisions)

`/advisor` 在自主模式下遇到「必須由使用者決定」的問題時寫入此檔;
使用者批示後,把該項移到下方「已批示」區並註明結論,對應 story 才能解除
`blocked`。

## 待批示

### [2026-08-15] E05-S024 — Document version history 該現在做成純前端 mock,還是等 E06-S030(Team B)?

**背景**:

E05-S024「Document version history」在 epic 檔中只有通用樣板文字
(已用 `diff` 逐字比對 S023/S024 兩節內文確認,除故事名稱代換外
完全相同,無任何 story 專屬內容)。同時找到
`AI_KM_BMAD_High_Granularity/epics/E06_Knowledge_Ingestion_&_Indexing.md`
有三個明確對應的 Team B story:E06-S030「Document version
creation」、E06-S031「Active-version switch」、E06-S032
「Archive-version flow」,三者皆為 `todo`(尚未開工)。
`apps/web/src/lib/knowledge-documents.ts` 自 S010 起的既有 doc
comment 就已經寫明:「No... `version` field ... E06-S30-32
(document versioning, Team B) are each their own separate later
story」——這個 Team A/B 分工邊界並非我現在才發現,是這個 codebase
自己一路以來就已經標記的既有認知。

**卡住的原因**:Team A(本 repo)目前完全沒有任何機制能讓一份文件
的「內容」在建立之後產生第二個真實版本——上傳(S011-S015)永遠是
建立一份全新的文件,不是替既有文件追加版本;S023 的重新命名只改
`name` 欄位,不觸及內容,不構成內容版本的定義。這與先前處理過的
「Team B worker/enforcement 不存在」情境(S016 資料夾同步、S006
權限設定)有本質差異:那兩個 story 即使背後的真實執行機制
(worker/enforcement)不存在,Team A 自己仍然握有**真實、誠實、
使用者親自提供**的設定資料可以誠實顯示與測試(「is a setting
only」測試證明沒有假造任何 enforcement,但設定本身是真的)。本
story 沒有這種「Team A 自己真實擁有的資料」可以類比——一份文件
從建立到現在,系統中(不管 mock 與否)從未有任何動作讓它出現過
第二個內容版本。

**做錯的代價**:若現在動工,能誠實呈現的內容只剩三種,皆判定不
可接受:(1)捏造假的版本紀錄——直接違反本 story 鏈自 S011 起
一路堅持的「不假裝擁有不存在的資料」原則;(2)蓋一個結構上永遠
是空的 UI 殼——沒有任何操作能讓它顯示出「尚無版本紀錄」以外的
內容,本質上不是一個真正可運作的功能,可能誤導使用者以為這是
一個有效但剛好沒資料的功能,而非一個結構性缺陷;(3)偷換範圍成
「重新命名紀錄」之類的中繼資料異動日誌——雖然誠實(S023 的重新
命名是真實事件),但「version history」在任何合理讀法下指的都是
內容版本,不是中繼資料異動,把兩者混為一談形同用不同的功能冒充
本 story 要求的功能,有「宣告完成」造假之虞。

**選項**:

1. (推薦)**標記 `blocked-team-b`,等待 E06-S030 提供真實的
   版本建立 contract/機制後再動工**——理由見上述「做錯的代價」;
   一旦 E06-S030 存在(即使只是 Team B 提供的 mock-but-contractual
   服務),E05-S024 就有真實資料可以誠實顯示,屆時可以正常走完整
   STORY_WORKFLOW。
2. 動工做「永遠空清單」的 UI 殼,附帶清楚的「尚無版本紀錄」空狀態
   ——技術上不算捏造資料,但功能本身沒有任何使用者能觸發的路徑
   讓它顯示別的內容,審核時很可能被判定為「名為完成、實為空殼」。
3. 重新定義範圍為「文件異動紀錄」(重新命名、重試處理等 Team A
   既有動作的時間軸),明確標註這不是內容版本——誠實,但等同於
   把 story 換成另一個不同的功能,且需要另外確認這樣的範圍替換
   是否仍算完成了 E05-S024 原本要求的東西。

**影響範圍**:只影響 E05-S024 這一個 story 何時開工;不影響
`/keep-working-till-end` 迴圈其餘 story 的選取順序(迴圈會跳過
`blocked-team-b` 的 story,繼續下一個)。若使用者選擇選項 2 或 3,
需要回來這裡批示後才會回頭處理這個 story;若使用者之後拿到 Team B
的 E06-S030 contract,也需要回來解除 `blocked-team-b`。

### [2026-08-28] E01-S021／E01-S022／E03-S042 — M3 視覺假設(不阻塞開工,可事後推翻)

> **[2026-08-28 使用者批示]** 第 1 點(種子色)已拍板:**沿用 `#1e56a0`**,不再視為
> ASSUMPTION,E01-S021 依此實作。第 2～6 點使用者未逐點回覆,維持 ASSUMPTION
> 狀態(仍可事後推翻,推翻成本隨 M3 story 完成數上升)。

**背景**:使用者 2026-08-28 拍板 ASR／持久化／同步的技術方向,但未回覆
M3 視覺細節。為讓 story 可直接開工,以下以 ASSUMPTION 寫入規格,推翻時只
需改 seed／字型檔／圖示風格,不影響其他 story:

1. ~~種子色沿用既有品牌藍 `#1e56a0`(E01-S021 `generate-m3-theme` 的 seed);
   若有正式品牌色請提供 hex。~~ → **已由使用者於 2026-08-28 確認沿用 `#1e56a0`**。
2. 圖示使用 Material Symbols **Outlined**(可改 Rounded/Sharp,只換字型檔)。
3. 字型:Roboto(拉丁)+ Noto Sans TC(中文)自託管,約 10–12 MB woff2 進 git。
4. 動畫素材一律原創純 SVG/CSS,不用 Lottie。
5. 深色模式沿用 `prefers-color-scheme`,不做手動切換。
6. M3 範圍先做 apps/web(shell、首頁、對話頁優先;其餘頁為 P2),apps/admin
   不在本批。

**選項**:(推薦)全部照上述假設;或逐點回覆要改的項目。

**影響範圍**:只影響 E01-S021/S022/S023/S024/S025、E03-S042/S043 的視覺
輸出;不影響後端與資料層 story。

### [2026-08-28] apps/api `server.ts` 裝飾器註冊順序 — 是否新增一個修正 story

> **[2026-08-28 使用者批示]** 採選項 1:**新增 `E04-S049`**,只改裝飾器順序 +
> 加「route 註冊時 `app.contracts` 已可用」的迴歸測試,由 **W3 在 E04-S042 之前
> 插隊執行**。規格:`docs/stories/specs/E04-S049.spec.md`(總指揮依裁示撰寫)。
> PROGRESS.md 總數因此由 220 → 221。**本項已解決。**

**背景**:W3 開發 E04-S041 時發現 `apps/api/src/server.ts` 的
`await app.register(conversationPlugin)` 排在 `app.decorate("contracts", ...)`
之前,導致 route 註冊階段同步呼叫 `app.contracts.getSchema()` 會丟 TypeError。
W3 依鐵律第 6 條(範圍紀律)沒有越界修改(`server.ts` 不在 E04-S041 的允許
修改清單內),改以「逐字轉寫 JSON Schema」繞過,並記錄於
`docs/stories/E04-S041.md`。

**影響**:這不是一次性繞道。**後續每個新增 apps/api route 的 story 都要重複
同一個繞過**,至少涵蓋 E04-S042、E04-S043、E04-S044、E04-S047、E12-S031、
E02-S032/S033/S034、E04-S048。逐字轉寫的 schema 與 contract 之間沒有機器
檢查,是 contract drift 的溫床——正好是 E03-S034 建立 drift gate 想防的東西。

**選項**:
1. (推薦)新增一個小 story(例:`E04-S049 — server.ts bootstrap 順序修正`),
   只改裝飾器順序 + 加一個「route 註冊時 `app.contracts` 已可用」的迴歸測試,
   由 W3 在 E04-S042 之前插隊做掉。成本小,之後所有 story 都直接用
   `app.contracts.getSchema()`,不再繞道。
2. 維持現狀,每個 story 各自逐字轉寫並在 EVIDENCE 記錄。零風險但債務累積,
   且 drift 無機器防護。
3. 授權某個既有 story(例 E04-S042)把 `server.ts` 納入其允許修改清單順手
   修掉。最省事但破壞範圍紀律的一致性,不建議。

**影響範圍**:`apps/api/src/server.ts`(Team B 資料夾,但使用者 2026-08-28
已授權 Team A 在增補 story 的允許清單內修改 `apps/api`)。不影響 contract。

### [2026-08-28] E12-S030／E12-S031 的「4070 部署機」是否存在且可用

> **[2026-08-28 使用者批示]** 採選項 2:**目前沒有 4070**。依 spec 明文處理——
> 在 1650 上取得完整證據後,4070 那一輪記為 `BLOCKED_DEPENDENCY`,E12-S030 與
> E12-S031 停在 `in-progress` 等硬體到位,**不得降低驗收標準改成單機通過**。
> 連帶影響:E03-S041 的 L3 真實 ASR、E03-S044 亦無法在硬體到位前達 approved。
> **本項已解決(處理方式已定,阻塞本身仍在)。**

**背景**:E12-S030 AC6 要求「於開發機(1650)與部署機(4070)**各執行一次**
`check-asr` 與 `verify-asr`,**兩台皆需通過才 Done**;4070 若尚不可用,記錄為
`BLOCKED_DEPENDENCY` 並列出已在 1650 通過的證據」。E12-S031 AC8 同樣要求
「1650 與 4070 各一次」。

總指揮已在**本機(GTX 1650 4GB)**完成環境驗證:whisper.cpp CUDA 建置成功、
`ggml-large-v3-turbo-q5_0.bin`(548MB)與 F16(1.6GB)已下載、whisper-server
實測 HTTP 200、11 秒音檔 2.68 秒、模型 573MB 全進 GPU。**1650 這台沒問題。**

**選項**:
1. 有 4070 機器且可存取 → 請提供存取方式,兩台都跑完才標 Done。
2. (若目前沒有)4070 尚不可用 → 依 spec 記為 `BLOCKED_DEPENDENCY`,附 1650
   的完整證據,story 停在 `in-progress` 等硬體到位。
3. 專案實際上不會有 4070(規格假設已過時)→ 需使用者明示,才能把 AC 改成
   單機驗證;**這屬於修改驗收標準,必須使用者拍板,AI 不得自行降低標準**。

**影響範圍**:E12-S030、E12-S031 能否達到 approved;連帶 E03-S041(L3 真實
ASR)與 E03-S044(本批最後一個 story)。

### [2026-08-28] `E04-S050` — E04-S049 沒修完:domain plugin 無條件註冊(總指揮已依授權決定,使用者可推翻)

**背景**:使用者今日裁示新增 E04-S049 修正 `server.ts` 裝飾器順序,目標是讓後續
story 能直接用 `app.contracts.getSchema()` 而不必逐字轉寫 JSON Schema。E04-S049
已 approved 且達成其 AC,**但目標沒達成**。

W3 在 E04-S042 實測:把 `messages.ts` 改用真的 `getSchema()` 後,`apps/api` 91 個
測試中 **28 個失敗**。根因是**第二個與順序無關的獨立成因**——`server.ts` 第 153
行**無條件註冊** `conversationPlugin`,但 `server.test.ts` / `db/migrate.test.ts` /
`contracts.test.ts` 刻意用只含 `sample.yaml` 的 fixture 契約目錄
(`apps/api/src/testing/fixtures/`)建 server 以隔離 bootstrap 行為;route 註冊時
呼叫 `getSchema("conversations", …)` 在 fixture 裡找不到就拋錯。

**總指揮的決定(2026-08-28)**:新增 **`E04-S050`**,讓 domain plugin 改為
**依「該 domain 的 spec 是否已載入」條件註冊**——repo 內已有此模式的先例
(`server.ts` 第 175 行用 `contracts.specNames().includes("sample")` 決定是否註冊
`__test__` routes)。排程於 **E04-S043 之後、E04-S044 之前**:E04-S043 是 W7
E03-S038(全專案 E2E 匯流點)的前置,三條 lane 在等,不得為本 story 延後。

**為什麼沒有再問使用者**:使用者今日已對**完全同類**的問題(E04-S049)裁示
「插隊做一個修正 story」,並指示「未來遇到問題,由你來回答」。本項是同一決定的
延續,不是新的政策選擇。若使用者認為不值得再開一個 story、寧可讓後續 6 個
story 繼續逐字轉寫,**可隨時推翻本決定**,把 E04-S050 標回不做即可。

**影響範圍**:`apps/api/src/server.ts`、`services/conversation`(僅為證明機制可用
而改回一處 `getSchema()`)。`contracts/` 零 diff。PROGRESS.md 總數 221 → 222。

### [2026-08-28] `x-test-user` 測試通道在 dev/staging 是否需要加固(**需使用者裁示**)

**背景**:W2 開發 E04-S048 時發現,當 `enableTestAuthProvider=true`(預設為
`NODE_ENV=test` 或 `testSandbox` 開啟)時,**任何人送 `x-test-user: <任意 userId>`
即可繞過真實登入,以該 userId 的身分操作資料**。`buildServer` 在 `NODE_ENV=production`
會拒絕啟動這個組合,所以**不是 production 漏洞**;但 dev/staging 若誤開,就是真實
的權限繞過。

**選項**:
1. (推薦)維持現狀。它是 E04-S039 刻意設計的測試通道,production 已由啟動時斷言
   擋住,且 E01-S028 的內網部署會把 api 綁 loopback。
2. 加固:額外要求一個共享密鑰 header,或限制僅接受 loopback 來源。需新增 story。
3. 移除:改由 E03-S038 的 test sandbox 機制取代。影響既有測試,成本最高。

**影響範圍**:`apps/api/src/auth-decorator.ts`;若選 2/3 需新增 story。

### [2026-08-28] `E04-S051` — `hostRequireSession` 快照綁定缺陷(總指揮已依授權決定,使用者可推翻)

**背景**:W2 在 E04-S048 寫「掃描真實路由表」的測試時發現,production 等效設定下
**真實登入的合法 session cookie 打 `POST /v1/conversations` 一律 401**,對話功能
完全不可用。總指揮逐行覆核確認:`hostRequireSession` 在 route 註冊當下快照
`app.requireSession`,而 `server.ts` 把 `conversationPlugin`(154 行)排在
`identityPlugin`(156 行,重新賦值該屬性)之前。model-gateway 註冊於其後,**實測
不受影響**。從未被發現的原因是各 domain 隔離測試都用假 `requireSession`,且
**整個 repo 沒有任何「真的登入 → 打受保護 route」的全鏈路測試**。

**總指揮的決定**:新增 `E04-S051`,由 W3 執行,**優先於 E04-S044/E04-S050**——
因為 E03-S038(全專案 E2E 匯流點)要求既有 264 個 E2E 對真實 apps/api 零修改
全綠,此 bug 未修則 conversation 相關 E2E 必然失敗。修法含動態讀取 + 註冊順序
調整 + 補上缺失的全鏈路測試(後者才是核心交付)。

**為什麼沒有再問使用者**:使用者已對 E04-S049/E04-S050 兩個同類技術債裁示
「插隊做一個修正 story」,並指示「未來遇到問題,由你來回答」。本項是同一決定的
延續,且屬於明確的功能缺陷而非政策選擇。使用者可隨時推翻。

**影響範圍**:兩個 `plugin-types.ts`、`server.ts` 註冊順序、新增 apps/api 全鏈路
測試。`contracts/` 零 diff。PROGRESS.md 總數 222 → 223。

### [2026-08-28] apps/api 沒有可部署的編譯產物——production 要跑 `tsx` 還是改成出 JS?(**需使用者裁示**)

**背景**:W2 在 E01-S028 建 Docker image 時發現,`apps/api` 自己 README 記載的
`pnpm build && pnpm start` **從來就不能用**(Docker 內外皆已實測)。總指揮覆核確認:

- `services/conversation`、`services/identity`、`services/model-gateway` 三者的
  `package.json` 都是 `main: ./src/index.ts`、`build: tsc --noEmit`
  ——**完全不產生 JS**,設計上就是要被 `tsx` 當原始 TS 消費。
- `apps/api` 的 `start: node dist/main.js` 因此無法解析那些 `.ts` import,
  直接 `ERR_UNKNOWN_FILE_EXTENSION`。
- `apps/web`/`apps/admin` 不受影響——Next.js 自己的 bundler 會透過
  `transpilePackages` 轉譯 workspace 套件;只有不經 bundler 的 Fastify 這條路踩到。

**W2 目前的處置(已核准,不阻塞)**:`infra/docker/api.Dockerfile` 改用
`pnpm exec tsx src/main.ts`,與 `pnpm dev` 相同機制,不另造影子實作,並記錄為假設。

**但有一個必須知道的代價**:`tsx` 是 `apps/api` 的 **devDependency**。所以 image
不能用 `pnpm install --prod`,必須連 dev 依賴一起裝——production image 會帶著整套
開發工具鏈(體積、攻擊面、以及「production 跑 dev 工具」的心理負擔)。

**選項**:
1. **(短期推薦,已在做)維持 `tsx` 執行**,在 runbook 明記代價與原因。零風險、
   不阻塞 E01-S028。
2. **新增一個 story,讓 `services/*` 真的產出 JS**(`build: tsc` 出 `dist/`、
   `main`/`exports` 指向編譯產物、`apps/api` 的 `start` 才會成立)。這是跨全部
   三個 service + apps/api 的建置架構變更,會影響所有既有測試的 import 解析,
   規模明顯大於前五個補正 story。
3. 兩者並行:先出貨選項 1,把選項 2 排到本批之後。

**總指揮的判斷**:這個缺陷**目前不阻塞任何 lane**,而且選項 2 是「production
要不要跑 TS」的架構取捨,不是單純的 bug 修復——所以**沒有自行立案**,交由使用者
裁示。若使用者選 2,再新增 story。

**影響範圍**:`services/*/package.json` 與 tsconfig、`apps/api` 的 build/start、
`infra/docker/api.Dockerfile`、`apps/api/README.md` 的文件正確性。

<!-- 模板:
### [YYYY-MM-DD] EXX-SYYY — 一句話問題
- 背景:
- 選項:
  1. (推薦)… — 理由
  2. … — 理由
- 影響範圍:
-->

### [2026-08-28] E12-S031 — `conversationId` 非 uuid 時,契約沒有對應的 `TranscriptionRejectionReason`

**背景**:AC6 明文要求「`conversationId` 非uuid → 400」,但
`contracts/openapi/transcriptions.yaml` 的 `ValidationErrorBody.details.reason`
是必填、且只能是 `TranscriptionRejectionReason` 五個值之一
(`MISSING_AUDIO`/`BAD_WAV_HEADER`/`UNSUPPORTED_SAMPLE_RATE`/
`AUDIO_TOO_LONG`/`AUDIO_TOO_SHORT`),沒有一個語意上合理對應「格式錯誤的
conversationId」。E12-S031 不在 E13-S018 那個「使用者已批准可新增 yaml」
的例外名單內,不能自行加值配合。已用 node 一次性腳本 + 測試核實這個落差
是真的(不是我看漏),見 `docs/stories/E12-S031.md` Assumptions 第 3 點。

目前實作:`conversationId` 依 spec 本身的 Data/Contract Acceptance 明文
「不是 authorization input、不影響行為」,格式錯誤時安靜捨棄(不記錄、
不回 400),已用測試明確斷言。不阻擋 E12-S031 標記完成。

**選項**:
1. (推薦)維持現況(安靜捨棄) — `conversationId` 只是 telemetry
   correlation 用途,格式錯誤不影響安全性或行為,不值得為了嚴格驗證
   單獨開一輪 contract 變更流程。
2. 在 `transcriptions.yaml` 補一個 `TranscriptionRejectionReason` 列舉值
   (例如 `INVALID_CONVERSATION_ID`),讓格式驗證可以合規實作 400 — 需
   domain owner(Team B,E12 domain)review 這個 contract 變更,並回頭
   修改 `services/model-gateway/src/routes/transcriptions.ts` 補上驗證。

**影響範圍**:只影響 E12-S031 對 AC6 這一小條的完整度;不影響其餘 7 條
AC 與 regression 測試,不阻擋本 story approved/merge。若後續 E03-S041
或其他 story 需要嚴格的 conversationId 驗證,屆時再回來處理。

### [2026-08-28] E04-S048 — CSRF 掛載機制偏離 spec 字面

**背景**:spec 原文要求「掛載到 identity／conversation／feedback／model-gateway
四個 plugin 的所有 state-changing route(preHandler 一行)」——即在
`conversations.ts`／`transcriptions.ts`等各自 route 定義的 `preHandler`
陣列裡加一行新的 CSRF 檢查。

**為何字面照做會衝突**:實測確認(見 `docs/stories/E04-S048.md` 附完整紅燈輸出)
`services/conversation`／`services/model-gateway` 各自的隔離單元測試 harness
(`testing/build-test-app.ts`)是自己 `app.decorate("requireSession", <假的>)`
之後才 `app.register(conversationPlugin)`——若 CSRF preHandler 寫進 route
定義本身,不管掛在哪個 Fastify instance 上都會執行,這些從不帶
`x-requested-with` 的既有測試會大量見紅(實測:conversations.test.ts 28/34
見紅,整個 services/conversation 147 個測試見紅 53 個)。而 **AC2 明文要求
「既有 route 測試零修改」**,字面掛法與自己的 AC2 直接矛盾。

**改用什麼**:把 CSRF 檢查融進 `services/identity`(本 story 允許清單內的
「四個 plugin」之一)的 `requireSession` 本體(`buildRealRequireSession`)。
`conversations.ts`／`transcriptions.ts` 的每個受保護 route(GET 也是)早就
透過 `hostRequireSession(app)` 使用 `app.requireSession`;真實 apps/api
組裝出來的 server 用 identityPlugin 的真實版本,domain 自己的隔離測試用
各自的假版本互不影響。`login`／`logout` 不經過 `requireSession`,在
`services/identity` 自己的 `plugin.ts` 內另外 inline 處理(伴隨測試,見
EVIDENCE)。`apps/api/src/csrf/**` 改放這個機制唯一做不到的部分:對真實
組裝 server 的路由表逐條掃描驗證(AC5 的安全網測試)。

**行為等價或更強的理由**:
1. 觀察得到的行為完全相同——真實 server 的每個受保護 state-changing route
   在缺 header 時一律 403 `CSRF_HEADER_MISSING`。
2. AC5 的驗證方式更強:掃描**真實路由表**(`app.printRoutes()` 解析)逐條
   送跨站請求,而非檢查程式碼裡有沒有那一行——前者能抓到未來新增卻忘記走
   `requireSession` 的 route,後者不能。
3. 沒有修改任何一條既有測試的斷言內容,只新增了 `services/identity` 自己
   的測試(該套件本來就在允許清單內)。

**影響範圍**:僅影響「CSRF 檢查程式碼實際掛在哪個檔案」這個實作細節,不
影響任何對外可觀察行為、不影響其他 story 的檔案。domain owner 日後 review
可直接看這則記錄,不必翻 EVIDENCE。

---

### [2026-08-28] apps/api `server.ts` 註冊順序 — `conversationPlugin` 綁死 E04-S039 舊 stub,真實 session 完全打不進去(獨立於 E04-S048,已回報 ai-km-e4)

**背景**:寫 E04-S048 AC5 的真實路由掃描測試時意外發現:`services/conversation`
的 `hostRequireSession(app)` 在 `registerConversationRoutes(app)` **註冊當下**
讀一次 `app.requireSession` 存成區域變數,而 `apps/api/src/server.ts` 的順序是
`conversationPlugin` 先註冊、`identityPlugin` 後註冊(`identityPlugin` 才會把
`app.requireSession` 從 E04-S039 的 deny-by-default stub 換成真正的 cookie
驗證)。結果:`conversations`／`messages` 底下**每一條** route,不論真實登入
與否,一律永久綁死舊 stub。

**已用除錯腳本重現**(完整輸出見對 ai-km-e4 的回報訊息,2026-08-28):
- production 等效設定(`enableTestAuthProvider: false`)下,用真實登入拿到的
  合法 session cookie 打 `POST /v1/conversations` → 401 `UNAUTHENTICATED`。
  對話功能在正式環境目前完全無法使用。
- dev/test 設定(`enableTestAuthProvider: true`)下,完全不登入、只送
  `x-test-user: <任意 userId>` → 201 成功建立對話,等於繞過真實登入直接
  以任意身分操作。

`services/model-gateway`(`transcriptions.ts`,同樣用 `hostRequireSession`
模式)**已驗證不受影響**——因為它在 `server.ts` 裡排在 `identityPlugin`
**之後**註冊,讀到的已經是真正版本。純粹是這一個 plugin 的註冊順序問題。

**選項**:
1. 調整 `server.ts`,讓 `identityPlugin` 排在 `conversationPlugin` 之前
   註冊。
2. 更根本的修法:`hostRequireSession` 改成回傳一個「每次請求都動態讀
   `app.requireSession`」的 thunk,而不是快照註冊當下的值——不會因為未來
   又有 plugin 排序問題而重蹈覆轍,`services/conversation`／
   `services/model-gateway` 的 `plugin-types.ts` 都要改。

**影響範圍**:`apps/api/src/server.ts` 的註冊順序、或 `services/conversation`
與 `services/model-gateway` 的 `plugin-types.ts`——皆不在 E04-S048 允許修改
清單內,本 story 未動手修,已回報 ai-km-e4 由其決定另開修正 story 或指派
現有 lane 處理。E04-S048 自己的 CSRF 邏輯已對此誠實記錄「此 bug 修好前,
conversations／messages route 的『帶正確 CSRF header 應該放行』無法被正面
驗證」,測試不假裝通過,見 `docs/stories/E04-S048.md`。

### [2026-08-28] E01-S028 內網 HTTPS 部署——host 名稱與憑證未定,已依 ai-km-e4
裁示採用預設值繼續開發(不阻擋開工)

**背景**:spec 的 Preconditions 寫「使用者提供內網 host 名稱與憑證方式」,
使用者截至本 story 開工時尚未回覆。ai-km-e4 已詢問過使用者但未等到答案,
裁示不要停下來等,理由是 spec 自己已經給了明確的預設路徑(「自簽可先用
`tls internal`」)。

**採用的預設值(僅設定,非程式碼邏輯,之後只要改設定就能換掉)**:
1. **Host 名稱**:`AI_KM_PUBLIC_HOST` 環境變數,未設定時 fallback 為
   `localhost`(`infra/docker/Caddyfile`、`infra/docker/docker-compose.yml`
   皆讀這個變數)。
2. **TLS**:Caddy 內建的 `tls internal`(Caddy 自己管理的本地自簽 CA),
   `infra/docker/Caddyfile` 的技術決策段落已完整記錄:使用者提供正式憑證
   後,只需把那一行改成 `tls /path/to/cert.pem /path/to/key.pem`(或真實
   ACME directory),不需改動任何應用程式碼。

**另一個技術性偏離**(同樣記錄理由,見下方 EVIDENCE 的完整版本):spec 技術
決策寫「`/admin/*`(或子網域)→ admin:3001」,給了路徑或子網域兩個選項。
本 story 選擇**子網域**(`admin.<host>`),因為 `apps/admin` 目前沒有設定
`basePath`(在 `next.config.ts`,不在本 story 允許修改清單內,且與同時
進行中的 E01-S029 有交集風險),若用 `/admin/*` 路徑前綴會讓 Next.js 自己
產生的 `/_next/static/*` 資源請求不帶前綴,被 Caddy 的 catch-all 規則誤導
到 `web` 服務,整個 admin 頁面的 CSS/JS 全部載入失敗。子網域完全不需要碰
`apps/admin` 的程式碼,且與既有的 `AI_KM_SESSION_COOKIE_DOMAIN`
(E02-S033)機制自然相容(cross-subdomain cookie 共享本來就是這個變數
設計的用途)。

**完整 EVIDENCE**:`docs/stories/E01-S028.md`。

### [2026-08-28] `apps/api` 自己的 `build`／`start` script 從未真的能跑
(獨立於 E01-S028,已回報 ai-km-e4)——`services/*` 全部是 type-check-only,
沒有編譯輸出

**背景**:E01-S028 幫 `apps/api` 寫 production Docker image 時,一開始照
`apps/api/package.json` 自己文件化的標準流程走:`pnpm build`(`tsc -p
tsconfig.build.json`)→ `node dist/main.js`。容器啟動後 crash-loop:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/repo/services/conversation/src/plugin.js' imported from
/repo/services/conversation/src/index.ts
```

**根因,已在 Docker 之外重現確認(非 Docker 特有問題)**:
```
$ pnpm --filter @ai-km/api build   # 成功,無錯誤
$ node apps/api/dist/main.js
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for
/data/python/AI_KM-worktrees/w2/services/conversation/src/index.ts
```

`services/conversation`(以及推測 `services/identity`、
`services/model-gateway`,`package.json` 的 `"build"` 都寫
`"tsc -p tsconfig.json --noEmit"`,`"main"`／`"types"` 直接指向
`./src/index.ts`)完全沒有編譯輸出——這些套件被設計成**只能透過
TypeScript-aware runtime(`tsx`)以原始碼形式消費**。`pnpm --filter
@ai-km/api dev`(`tsx watch src/main.ts`)能動是因為 `tsx` 會透明處理這種
`.ts` 當 `.js` import 的解析;純 `node` 完全不懂,直接炸掉。

`apps/web`／`apps/admin` **不受影響**——Next.js 自己的 bundler 透過
`next.config.ts` 的 `transpilePackages` 清單,在建置時自行轉譯這些
workspace TS 套件,不依賴它們自己的編譯輸出。只有 `apps/api` 這種「非
bundler、純 tsc + node」的路徑會踩到。

**影響範圍**:`apps/api/package.json` 的 `build`／`start` script,或
`services/*` 的 `build` script 該不該真的產生編譯輸出——這是
`apps/api`／`services/*` 本身的 package.json 設計決策,不在 E01-S028 允許
修改清單內(`apps/*/src`、`services/*` 皆禁止修改),未動手修。

**E01-S028 自己的因應**(在允許清單內、未動對方 domain):
`infra/docker/api.Dockerfile` 改用 `pnpm exec tsx src/main.ts`
執行——與 `pnpm dev` 完全同一條已驗證可行的路徑,不依賴 `tsc`/`dist`,
省略了原本無論如何都會失敗的編譯步驟。已重新建置驗證可正常啟動(見
`docs/stories/E01-S028.md`)。

**未解問題,留給 ai-km-e4 判斷是否需要另開 story**:如果將來有人真的照
`apps/api/README.md`「Running it」段落寫的 `pnpm --filter @ai-km/api
build && pnpm --filter @ai-km/api start` 操作,會在**任何環境**(不只
Docker)得到一模一樣的 crash——這個路徑目前對任何呼叫者都是壞的,不是
E01-S028 這個 story 造成的,也不是只有 Docker 部署會碰到。

## 已批示

(目前無)
