# ai-km — Claude 開發規範(每個 session 必須遵守)

本 repo 是 AI KM 企業知識管理平台的 monorepo(Team A 視角)。規格基準在
`AI_KM_BMAD_High_Granularity/`(唯讀,禁止修改)。

## 強制工作流(2026-09-03 起:分階段 Gherkin,ADR 0008)

**開發演算法是 `.claude/rules/GHERKIN_WORKFLOW.md`**。epic-story 狀態機
(`STORY_WORKFLOW.md`)已退場,只保留給尚未收尾的舊 story;其用血換來的規則
全數搬進 GHERKIN_WORKFLOW §5,一條不丟。開工前先讀:

1. `docs/roadmap.md` 的「現況」表——現在在哪個整合點、回填到哪
2. 你要做的 `features/NN-name/FEATURE.md` 與 `NEXT.md`
3. 對應的 `phase-N.feature`(**測試就是規格**)
4. 相關的 `contracts/openapi/*.yaml` 與 `docs/adr/`

入口:

- `/feature <描述>` — 新需求分流,**先提案、等確認、再寫檔**
- `/phase-done <NN-name>/<phase-N>` — 驗收一個 phase(場景綠、單獨執行、反向驗證、人工確認)
- `/integrate <IN>` — 驗收整合點(`@e2e` 由使用者親手確認,不能被測試代替)
- `/decide <描述>` — 記 ADR(先評估契約影響;硬約定要使用者拍板)
- `/sprint [週]` — 讀所有 `NEXT.md` 算 ready,WIP ≤ 2

**狀態唯一來源**:各 `features/*/FEATURE.md` 的 phase 表。`docs/stories/PROGRESS.md`
與 `PENDING_DECISIONS.md` 自 2026-09-03 凍結為唯讀歷史。新的待決事項是 `docs/adr/`
的 Proposed ADR。

**遇到問題**:做 phase 時發現缺陷 → 在同一個 `.feature` 加一個場景(紅)修到綠,
不開編號;新需求 → `/feature`;依賴卡住 → `NEXT.md` 寫 gate 與「現在能先做什麼」,
其他資料夾繼續。

**角色守門**:開發 agent 不改 `*.test.ts`、`features/steps/**`、`.feature`;
測試 agent 依 `.feature` 先寫(紅);共用檔只有協調者改;`.feature` 只由使用者或
`/feature` 流程經確認後改。

非 phase 的雜項修改(修 CI、調 scaffold)不需走 `/phase-done`,但仍受下方鐵律約束。

## 鐵律(違反即停止並回報)

1. **不發明 contract**:endpoint / schema / permission 不存在 → 回報 BLOCKED,
   不猜測。`contracts/` 是唯一真相來源,改 contract 前必須先問使用者。
   (例外:使用者 2026-08-28 已批准的 contract story——E02-S031、E04-S038、
   E12-S029、E13-S018——可依其 story 規格新增對應 yaml;其他 story 仍不得
   改 contract。)
2. **Fail closed**:Authorization 先於 retrieval;Deny-Wins;未授權資料不進
   context/citation/export/log。
3. **前端與 BFF 不直連 DB / vector store**;只透過 `@ai-km/api-client`。
4. **不造假綠燈**:禁止 skip 測試、passWithNoTests、放寬 assertion、`|| true`。
   紅就是紅,誠實回報。
5. **Mock 不算整合證據**;mock 只用於解除平行開發阻塞。
6. **範圍紀律**:只改 story 允許清單內的檔案;Team B 資料夾
   (`apps/api`、`apps/worker-*`、`services/*`、`db/*`)與
   `AI_KM_BMAD_High_Granularity/` 一律不動。
   (例外:使用者 2026-08-28 明示授權並指派 Team A 開發的增補 story——
   E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021——可在**該 story 允許修改清單內**修改 `apps/api`、`services/*`、
   `db/*`、`infra/*`;導讀見 `docs/architecture/voice-persistence-sync-m3.md`
   與 `docs/architecture/tech-debt-audit-2026-08-28.md`。)
   (例外:使用者 2026-09-02 核可的 **Wave 1**——把 `services/rag-skeleton/` 化為
   `services/retrieval`、`services/generation`、`services/ingestion`(索引側)——
   E04-S009/S016 與 E04-S058～S067、E06-S008/S022/S026/S041/S042/S043、
   E12-S032～S033,同樣限**該 story 允許修改清單內**。詳見 README.md 的
   2026-09-02 Wave 1 段落。**此為補記**:使用者核可的 Wave 1 計畫本就明列這三個
   service,是紀錄漏列,不是擴權。
   （`services/rag-skeleton/` 已於 2026-09-02 由 E04-S064 退場，目錄不再存在；本段保留為授權紀錄，不再構成對任何路徑的修改許可。）)
   (例外:使用者 2026-09-02 明示授權建立 `services/rag-skeleton/`(RAG walking
   skeleton:chunking、embedding provider、vector store、authorization scope、
   generation provider 五層,對應 E04 RAG & Conversation Intelligence 與
   E06 Knowledge Ingestion & Indexing),另新增 `contracts/openapi/embedding.yaml`、
   `contracts/openapi/generation.yaml`。此為全新檔案,未修改任何既有 Team B
   程式碼或 story。Domain ownership 仍屬 Team B;之後若要將骨架拆分併入既有的
   `services/retrieval`、`ingestion`、`knowledge`、`generation` stub,需 domain
   owner review。
   （`services/rag-skeleton/` 已於 2026-09-02 由 E04-S064 退場，目錄不再存在；本段保留為授權紀錄，不再構成對任何路徑的修改許可。）)
   (例外:使用者 2026-09-02 追加授權——**僅限 g1–g5 的 Model Gateway 接線**。
   使用者原話:「授權:g1-g5 範圍內,可修改 `services/model-gateway/`(新增
   embedding/generation provider 抽象、兩條路由)與 `apps/api/`(條件註冊、
   contracts 載入、必要的 package.json 變更)。範圍僅限本輪 g1-g5 描述的工作,
   不含其他 Team B story。Domain ownership 仍屬 Team B」。
   g1–g4(provider 抽象、兩條薄包裝路由、config、contracts 載入)已於同日完成;
   **g5(把 deterministic／canned provider 從 `services/rag-skeleton` 搬進
   model-gateway)依使用者裁示登記為 E12-S032／E12-S033**,同屬本授權範圍。
   **此授權只涵蓋這一批工作,不是全面開放 `services/model-gateway/` 或
   `apps/api/`**;其他 Team B story 一律不動。條件註冊比照既有
   `conversationPlugin`／`feedbackPlugin` 樣式。
   ※ 本段 2026-09-02 更正:初次登記誤寫為「僅限 g1–g4」,漏掉使用者原話裡的
   g5。由 E12-S032 的獨立審核者發現本檔的 Team A 例外清單只列 E12-S029～S031、
   未涵蓋 S032 而提出。更正方向是讓紀錄符合使用者實際授權的文字,不是擴權。)
7. **證據落檔**:story 沒有 `docs/stories/EXX-SYYY.md` 就不是 DONE。

## Team A 範圍

只實作 E01/E03/E05/E07/E09/E11/E13 的 story。依賴 Team B(E02/E04/E06/E08/
E10/E12/E14)時:對 contract 草案 + mock 開發,並在 EVIDENCE 記錄。
**2026-08-28 起 Team A 另負責使用者增補並指派的 40 個 story**:E01-S021～S028、E02-S031～S033、E03-S034～S046、E04-S038～S044/S047、E11-S026、E12-S029～S031、E13-S018～S021
**2026-09-02 起另負責 Wave 1**(E04-S009/S016、E04-S058～S067、
E06-S008/S022/S026/S041/S042/S043、E12-S032～S033)
(含落在 Team B epic 的 E02/E04/E12 story,domain 仍屬 Team B,contract 變更
需 domain owner review)。E04-S037 維持 Team B。全部走完整狀態機,進度登記於
PROGRESS.md 各 epic 章節。

## 開發環境

- Node 22(`.nvmrc`)、pnpm workspace + Turborepo、TypeScript strict。
- 驗證指令:`pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test`。
- Apps:`apps/web`(:3000)、`apps/admin`(:3001),共用 `packages/*`。

## 參考順位(衝突時由高到低)

1. `AI_KM_BMAD_High_Granularity/policies/`(三份 policy)
2. `.claude/rules/STORY_WORKFLOW.md`
3. epic 檔中該 story 的開發邊界
4. 本檔其餘內容
