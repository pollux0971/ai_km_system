# 需要使用者決定的事(唯一收件匣)

依 CLAUDE.md「決策權」段:只有**以前沒提過的功能、產品行為未定義、契約放寬／新 endpoint、
新資料夾授權、付費或外部服務、真模型選型、整合點驗收**才進這裡。其餘由技術顧問或協調者定並記 ADR。

協調者遇到需要使用者的事:**在這裡加一列,然後繼續做別的,不停**。使用者批示後,協調者落地,
把該列移到「已批示」並附 commit / ADR。

## 待批示

| # | 日期 | 一句話 | 類別 | 建議(顧問/協調者) | 阻擋了什麼 |
|---|---|---|---|---|---|
| 23 | 2026-09-05 | **`apps/api` 到底是誰的地盤?** 起草 `boundaries.owners.json` 時撞到兩條真實衝突,而且它們是同一個問題的兩面:(1) `apps/api/src/health/checks.ts` —— `12-audit-observability` 的「範圍」明列它並對它做過反向驗證,`10-admin-console` 的「技術棧」也把整個 `apps/api/src/health` 列進自己的路徑清單;(2) `GET /v1/admin/health` 這條路由的角色守門,兩份 FEATURE.md 都寫進「範圍」,而 route 註冊與 `ADMIN_HEALTH_ROLES` 都在同一個 `server.ts`。<br>**更大的那一題**:`apps/api/src/` 底下 24 個檔(`server.ts`、`config.ts`、`rag-plugin.ts`、`csrf/**`、`db/**`…)**沒有任何 FEATURE.md 寫進「範圍」或「來源:實作」**,只被當「依賴」提過。所以真正要裁的是:**`apps/api` 是 glue／composition root(像 `contracts` 一樣全域放行、不屬於任何能力),還是要逐檔指派擁有者?**<br>起草者的判斷(僅供參考,草稿沒照它寫):`apps/admin` 前端**不會** import `apps/api/src/health/checks.ts`(鐵律 3),10 對它的依賴只在「HTTP 回應要吻合量測結果」的整合層,12 才是真正寫那支檔案行為的資料夾 | 工程取捨(顧問級) | 我沒有自己挑一個寫進草稿——草稿對衝突路徑**整個 `apps/api` 留白**,理由是一旦裁定「`apps/api` 是 glue」,那是對整個目錄的一次性裁決,先局部指派只會製造二次衝突 | `check-boundaries` 接進 CI |
| 24 | 2026-09-05 | **`packages/permissions` 的定位沒有人拍板過。** 實跑抓到它被 **6 個非 `02-authorization` 的資料夾直接 import**(`01-identity` 2 處、`08`、`09` 2 處、`10`、`11`)。`02-authorization` 的「來源」自認擁有它(`packages/permissions/src/index.ts`,僅型別),但 02 自己的「開放問題」也承認**這個 package 沒有任何決策邏輯**。<br>要裁的是:它該當 **02 專屬**(那 6 條就是真的越界,要修架構),還是該當**像 `contracts` 一樣全域放行**(那它該進 `contractsOwner` 那一類,不是某個能力的地盤) | 工程取捨(顧問級) | 從實況看它是**全域共用詞彙**(`Role` 型別散在六個資料夾),不是授權決策。但「型別可以全域共用」這件事一旦寫進 owners 表就是一條規則,不是一次例外,所以請你裁 | 同上 |
| 25 | 2026-09-05 | **205 個檔案沒有任何 FEATURE.md 宣稱擁有**,起草者依指示不硬塞。三類值得分開看:(a) `apps/web/src/lib` 約 65 個,其中 `messages.ts`/`conversations.ts` 直覺屬 03、`auth.ts` 屬 01、`transcription.ts` 屬 04,但**沒有一份 FEATURE.md 用反引號點名它們**;(b) `packages/{auth-client,config,logger,testing,types,ui,validation}` **七個 package 十二份 FEATURE.md 一次都沒提過**;(c) **整組 `erp-*`(11 檔)與 `diagnostic-*`** ——這兩類**根本沒有對應的能力資料夾**,因為 I8 的 `13-maintenance-assistant`／`14-erp-reporting` 依 ADR 0013 #3「後端資料來源未定前不建」。<br>(c) 與 roadmap 一致、不是缺陷;(a)(b) 是**回填的覆蓋缺口**——12 個 phase-1 證明了「能力現在會做的事」,但沒有證明「這些檔案屬於誰」 | 工程取捨(顧問級) | 建議分開處理:(a) 補進各資料夾 FEATURE.md 的「範圍」(小,但要逐檔確認);(b) 這七個 package 可能該歸 glue;(c) 維持現狀並在 owners 表註明「等 I8」 | 同上 |
| 21 | 2026-09-05 | **`check-boundaries.ts` 接不上**:它找 `<repo-root>/scripts/boundaries.owners.json`,而我們只有模板帶來的範例在 `features/scripts/`。實測 exit 1,訊息是「找不到設定檔」——**紅的原因是設定不存在,不是它抓到違規**。要接上得先寫一份本專案的 owners 表(哪個路徑屬哪個能力資料夾)。`boundaries.allow.json` 目前是 `[]` | 工程取捨(顧問級) | owners 表其實**可以從 `FEATURE.md` 的 owner 欄推導**,不是全新決策。我可以起草再請你審。但我不想在它紅在「設定不存在」的狀態下接進 `pnpm test`——那會讓 main 紅在工具沒設定好,不是紅在有人越界(坑 4:紅燈不再攜帶資訊) | 顧問說「I2 之前要接上」 |
| 22 | 2026-09-05 | **`check-standalone.ts` 是工具自己壞掉,不是抓到違規**:它對我們的 `standalone.json` 直接 `TypeError [ERR_INVALID_ARG_TYPE]: The "file" argument must be of type string. Received undefined`(`check-standalone.ts:95` 的 `spawnSync`)。根因:它 `Object.entries(manifest)` 全收,沒有跳過 `_` 開頭的 metadata 鍵,而我們的 manifest 第一個鍵是 `_doc`(一段長說明字串),於是 `entry.cmd` 是 `undefined` | 模板 bug(上游) | **修法很小(跳過 `_` 前綴鍵),但那個檔案的檔頭寫著「SOURCE: template v1.2.2 — 勿手改;升版用 sync-gates.sh」,所以我不手改。** 建議走上游:llm-learning-cards 的模板側修掉,我們在 I2 之後升 1.3.4 時一起收。09-07 的聯合回顧正好是場合 | 同上 |
| 26 | 2026-09-05 | **I2 的整合場景與 ADR 0014 互相矛盾——而且是整合點自己抓到的。** `docs/integration/i2-ask-in-web.feature` 的場景「A person outside the department gets nothing from that document」要求換部門的人拿不到 `eng` 的文件;但 **ADR 0014 明文裁定 I2 期間每個人都拿固定 `dept:eng` scope**,所以那個場景**在 I2 的定義下不可能綠**。<br>這不是實作缺陷:`03-conversation/phase-2.feature` 自己就有一個場景**斷言相反的事**(「兩個人都應該帶著同一個固定 `dept:eng`,因為 I2 還沒改變那件事」)。**兩份規格對同一件事各說各話,而整合點是第一個把它們放在一起跑的地方。**<br>時序:I2 的整合檔寫在 ADR 0014(2026-09-04,為了解除 I2 的阻塞而立)**之前**,沒有人回頭對齊。 | 整合點驗收 + `.feature` 修改 | **我的建議**:把那個場景搬到 **I3** 的整合點(「部門授權真的來自身分」正是 I3 的定義),並在 I2 留一條**明確斷言現況限制**的場景——讓「每個人都拿固定 scope」變成**看得見、會紅**的事實,而不是消失。走 `/feature`,`.feature` 我不自己改 | **擋 `/integrate I2`** |
| 27 | 2026-09-05 | **問一個文件裡沒有的主題,系統仍然給出引用。** `retrieve()` **沒有相似度門檻**,top-K 永遠回 K 筆;問「這份文件裡沒有的主題」,那份 `eng` 文件照樣被引用。<br>**措辭要精確**:這**不是「捏造引用」**(generation 層的守門有效,引用確實存在於 context),是**「答非所問」**——引用的是一份真實但不相關的文件。所以整合場景的文字「rather than an invented one」本身也不夠精準。<br>`services/generation/src/service.ts` 的檔頭早就寫著這是 **E04-S022 的未決問題**(「threshold a pending product decision」)。 | 產品行為未定義(門檻值) | **這條我不建議放寬場景。** 「問了不相關的問題卻拿到引用」是使用者第一次用就會撞到的東西——`docs/01-roadmap.md` 的 I2 段自己也預言了:「通過後立刻做:使用者拿自己的一份真實文件問三個問題,把**答非所問**的紀錄下來」。建議:(a) 先落一個保守門檻並記 ADR,或 (b) 明確接受限制、把場景文字改成斷言現況。**兩條都要決定,不能兩邊掛著** | **擋 `/integrate I2`** |
| 17 | 2026-09-04 | **回填 12/12 唯一還缺的:一次 UI 走查(約 10 分鐘)。** 開兩個 dev server:`pnpm --filter @ai-km/admin dev`(:3001)、`pnpm --filter @ai-km/web dev`(:3000)。七條,每條一行,做完回一句哪幾條過、哪幾條卡:<br>**1.** admin(:3001)以 IT 管理員登入 → 依序開 部門管理／群組管理／連接器管理／系統健康 → 四頁都出清單,不是錯誤畫面<br>**2.** 同上四頁 → 上面的資料就是自動場景印出來的那一份(不是空的、不是假資料)<br>**3.** web(:3000)→ 知識庫頁 → 一行 dev 指令就開得起來<br>**4.** 知識庫頁 → 選一個檔案上傳 → 它留在待處理清單上(不會閃掉)<br>**5.** 知識庫頁 → 上傳後 → 文件出現在文件清單裡(**這層目前是 mock**,你確認的是畫面行為,不是後端接上了)<br>**6.** web 開兩個視窗 → 其中一個開新對話並送訊息 → 另一個視窗的 歷史對話 不用重整就列出它<br>**7.** 接續 6 → 把 API 停掉 → 兩個視窗的 header 都顯示「同步連線中斷,重新連線中…」 | 整合點驗收(`@manual`／`@e2e`) | 三個資料夾(08、10、11)的自動那半都已全綠、各自做過對著決定性量的反向驗證。依 ADR 0013 這是**只有你能做**的兩件事之一(另一件是花錢);§5.4:任何檢查都構不到「有人看過並接受」。**卡住的那條比通過的那條有價值**,請直接說卡在哪一步 | 回填完成定義(12/12)。**不擋 I2** |

> 其餘 #1–#15 已由 ADR 0013 裁決,移至「已批示」。收件人自 2026-09-04 起為技術顧問
> (見 CLAUDE.md 決策權段與 ADR 0013);只有**付費**與**整合點 `@e2e` 親手驗收**才是使用者。

## 已批示

| # | 日期 | 一句話 | 批示 | 落地 |
|---|---|---|---|---|
| 16 | 2026-09-04 | GHERKIN_WORKFLOW §3 加「測試先紅階段,`.feature` 可進 main;`*.test.ts` 不可,合併點在綠之後」 | 使用者 2026-09-05 對技術顧問 session ai-km-1b 親口:「**加**」(顧問親自落地作證,協調者依「轉述不算」正確拒絕代落地) | 本 commit |
| — | 2026-09-03 | ADR 0008 四點(12 資料夾、I2 起、封存回填、owner 制) | 採建議預設,使用者未反對 | 0413543 |
| — | 2026-09-03 | 跨部門重匯 = 拒絕 | 使用者「我都批准了」 | E06-S043 |
| — | 2026-09-03 | analytics.yaml 三個 querystring default 進契約 | 使用者批 | E04-S081 |
| — | 2026-09-04 | 舊 epic-story 主線封存,gherkin-paradigm 成為主線 | 使用者「舊的 branch 就先 archived 了」 | tag `archive/epic-story-2026-09-04` |
| 5 | 2026-09-04 | CLAUDE.md 內部衝突:決策權表說「契約收緊顧問可批」vs 鐵律 #1 說「改 contract 前必須先問使用者」 | 使用者 2026-09-04 在協調者 session 指示合併 `story/docs-archive-restructure`——該 PR 的 CLAUDE.md diff 就是這條的裁決落地(以「**會不會讓以前合法的呼叫變不合法**」為判準,分請求側/回應側) | merge 23a087a |
| 6 | 2026-09-04 | 「決策權」表是否本來就該進 main | 使用者 2026-09-04 在協調者 session 的開場指示裡直接寫「CLAUDE.md『決策權』段是唯一可驗證的授權來源」,並指示合併——這正是該表最後一列保留給使用者的那個動作 | 開場指示 + merge 23a087a |
| 18 | 2026-09-05 | 「共用檔只有協調者改」連兩輪被跨過,要不要放寬 | **顧問 ai-km-1b 裁決:不放寬,而且我提的判準本身是錯的**——「移除它 typecheck 會紅」對開發 agent 寫的每一行都成立,篩不掉任何東西。真正的問題是 §6 的 `RETURN TO SENDER` grep **從寫下來就沒跑過**。改成:grep 擴充涵蓋共用檔 + 合併前必跑 + 有輸出就退件 | c20766e;PITFALLS 坑 16 |
| 19 | 2026-09-05 | `.feature` 由誰建:規則字面 vs 跨三個 phase 的實務 | **顧問裁決:採 (a)**(測試 agent 可新建已核准 phase 的 `.feature`),但補一條讓 PO 把關的東西不空掉:`FEATURE.md` 的 phase 列**必須帶一句意圖**,否則測試 agent 寫的 `.feature` 就是無人核准的規格 | c20766e |
| 20 | 2026-09-05 | ADR 0014 的「移除條件」是死的,要不要退回 `07-generation/phase-2` | **顧問裁決:不退回**,簽名該在第一個真的有身分的呼叫點改。補:實驗原文寫進 ADR 0014、`03-conversation/phase-2` 的反向驗證形狀寫成 DoD(嚴格級) | c20766e |
| 1 | 2026-09-04 | 「把文件從 A 部門移到 B 部門」是否為合法操作? | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):跨部門搬文件不是重匯副作用;顯式稽核操作,Wave 2 後 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 2 | 2026-09-04 | E04-S037 真模型 embedding 選型(bge-m3 已有 provider,是否定案)與 generation 模型 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):D2/D3 驗收通過;ADR 0009 Status 改 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 3 | 2026-09-04 | I8(維修助理／ERP 報表)的後端資料來源 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):I8 來源未定前不建 13、14 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 4 | 2026-09-04 | 舊 story 尚在 in-progress / blocked 的 15 個(見 story-to-capability-map 表尾)去留 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):各資料夾 NEXT.md 逐一判 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 7 | 2026-09-04 | **E04-S009 的四題**,phase-2 授權一行都不能寫之前要先定:(a) 部門顯示名(session 今天給「資訊部」)與 store 鑰匙(`dept:*`)的對應規則是什麼、誰維護;(b) 群組算不算一把鑰匙;(c) 部門與群組同時存在時是聯集還是交集;(d) 跨部門搬過去的文件,原部門還看不看得到 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):scopeKey=dept:<id>/group:<id>,顯示名不當鑰匙;授權聯集、Deny 作用於顯式拒絕;文件單一 scopeKey | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 8 | 2026-09-04 | `contracts/openapi/` **完全沒有 knowledge 路徑**,`08-knowledge-management` phase-2「接真 API」沒有對象 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):授權起草 knowledge.yaml(最小五個操作),/decide → 顧問批 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 9 | 2026-09-04 | 文件層 `visibleToRoles` 與知識庫層 `visibleToRoles` 的**語意未定義**(取交集?文件層覆蓋?Deny-Wins 怎麼套?) | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):兩層 visibleToRoles 取交集 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 10 | 2026-09-04 | phase-2 若要讓 `Message` 帶 citations,`conversations.yaml` 目前**沒有該欄位** → 契約放寬 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):Message 加選填 citations[],/decide | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 11 | 2026-09-04 | `GET /v1/health` **沒有登記進任何契約**(E04-S078,contract-equivalence 印 ABSENT)。`12-audit-observability` phase-1 的主力端點因此不受 L2-EQ 保護 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):/v1/health 進 core.yaml | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 12 | 2026-09-04 | 「答案沒有可引用來源」時,系統回的是自由文字(`沒有可引用的來源,無法回答:…`),**UI 分不出它與一段真答案**。要不要一個結構化的 abstention reason code(E04-S022 的缺口) | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):結構化 abstention(abstained + abstentionReason enum),/decide | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 13 | 2026-09-04 | `ResyncEvent.reason` 的 `SERVER_RESTART` 在契約裡,但 `routes/change-events.ts` **沒有任何路徑會送出**。是保留值,還是缺實作? | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):SERVER_RESTART 為保留值,description 註明 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 14 | 2026-09-04 | ~~已由 **ADR 0019**(使用者 2026-09-05 親口)在「目標模型」這一點上取代:不再分 super 與普通 administrator,I6 一起做~~ 部門主管能不能管**自己部門**的群組?目前授權表對 `/roles`/`/permissions`/`/departments`/`/groups` 一律只給 `super_administrator`,那是 E11-S023 在「角色描述沒有字面對應」時選的**最嚴讀法,不是最終政策** | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):部門主管管自己部門群組於 I6 落地;之前維持最嚴 | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
| 15 | 2026-09-04 | 顧問要求在 CLAUDE.md「強制工作流」段末尾加一行「採用範式模板 v1.0.0(2026-09-04)」。**協調者不自行動手**:CLAUDE.md 是你的規則檔,而這是 peer 的要求,不是你的話 | 顧問裁決(ADR 0013;使用者「之後你的決定就不需要我的裁決」):CLAUDE.md 加採用模板 v1.0.0 一行(本 commit) | ADR 0013;#2→ADR 0009;#8/#10/#12 各自 /decide |
