# LOCAL-S001 — RAG 開發前置:硬體規格確認與地端模型準備

> **命名空間說明**:`LOCAL-*` 是使用者增補的 story,不屬於唯讀規格庫
> `AI_KM_BMAD_High_Granularity/` 的 175 個 story。本檔即為此 story 的
> 規格權威(取代 epic 檔的角色);開發時仍走 `.claude/rules/
> STORY_WORKFLOW.md` 完整狀態機,證據落檔於 `LOCAL-S001.md`。

## Metadata

- **Story ID**:LOCAL-S001
- **標題**:RAG 開發前置 — 硬體規格確認與地端模型準備
- **來源**:使用者指示(2026-08-20):「Team B 在開發 RAG 系統前,要先
  確認電腦的規格如何,然後讓用戶下載模型並放到指定目錄讓 AI 測試」
- **型態**:環境就緒(environment readiness)story — 腳本 + 文件,
  不含任何 RAG 應用邏輯
- **技術決策**(使用者已拍板,2026-08-20):
  - Runtime:**llama.cpp + GGUF**,透過 `node-llama-cpp`(npm,自帶
    prebuilt binary,與 repo 的 Node/TS 技術棧一致,可寫 vitest 測試)
  - 模型範圍:**embedding + LLM 兩者都驗**
  - 指定目錄:**repo 內 `models/`**(入 `.gitignore`,模型檔不進 git)
- **參考硬體基準**(2026-08-20 於開發機實測,腳本必須動態重測,不得
  寫死):i5-11320H(8 執行緒)/ 32GB RAM / GTX 1650 4GB VRAM /
  `/data` 分區餘 305GB

## 建議模型(下載指引的預設內容)

| 用途 | 模型 | 檔案(GGUF) | 約略大小 | 理由 |
|---|---|---|---|---|
| LLM(優先) | Qwen3-4B-Instruct | `Qwen3-4B-Instruct-2507-Q4_K_M.gguf` | ~2.5GB | 中文能力佳;4GB VRAM 可部分 offload,CPU 推論速度可接受 |
| LLM(替代) | Qwen3-8B | `Qwen3-8B-Q4_K_M.gguf` | ~5GB | 品質較好,速度較慢;32GB RAM 跑得動 |
| Embedding | BAAI bge-m3 | `bge-m3-Q8_0.gguf` | ~0.7GB | 中英雙語檢索強,llama.cpp 已支援 |

驗證腳本以「目錄內實際存在的檔案」為準自動偵測,LLM 兩者擇一即可。

## Scope In(允許修改)

1. `tools/model-readiness/` **(新目錄)** — 本 story 的全部程式碼:
   - `check-specs` 腳本:偵測 CPU(型號/執行緒數)、RAM、GPU/VRAM、
     `models/` 所在分區的可用磁碟,輸出規格報告與模型建議
     (依實測規格判斷建議 4B 或 8B、可否 GPU offload)。
   - `verify-models` 腳本:掃描 `models/` 下的 GGUF →
     (a)embedding 模型:載入並對固定中文句子產生向量,驗證維度與
     非零值;(b)LLM:載入並跑一次最小中文 prompt 推論,驗證有
     非空回應。輸出成功/失敗/缺檔三態報告。
   - 上述腳本的 vitest 測試(TDD:先寫測試)。
   - `package.json` / `tsconfig.json`(此工具包自身的,workspace 註冊)。
2. `models/` **(新目錄)**:
   - `models/README.md` — 下載指引(模型名、Hugging Face 來源連結、
     預期檔名、放置方式、驗證指令)。
   - `models/.gitkeep`
3. 根目錄 `.gitignore` — 增列 `models/*.gguf` 與 node-llama-cpp 快取。
4. 根目錄 `package.json` / `pnpm-workspace.yaml` / `turbo.json` —
   僅限註冊新 workspace 所需的最小變更。
5. `docs/stories/LOCAL-S001.md`(EVIDENCE)、`docs/stories/PROGRESS.md`。

## Scope Out(禁止)

- 不實作任何 RAG 邏輯(chunking / 檢索 / 生成管線)— 那是 Team B 的
  E04/E06 範圍;本 story 只到「模型可載入、可推論」為止。
- 不動 `apps/*`、`packages/*`、`services/*`、`db/*`、`contracts/`。
- 不自動下載模型大檔(下載由使用者手動執行 — 使用者明示);腳本只
  負責偵測與驗證,缺檔時輸出指引。
- 不把模型檔、node-llama-cpp binary 快取或任何大型二進位提交進 git。

## Preconditions

- 無(不依賴任何其他 story 或 Team B contract;`contracts/` 不涉及)。
- 執行 `verify-models` 的完整驗證需要使用者已手動下載模型;缺檔屬
  正常的三態之一(見 UX AC),不是 BLOCKED 條件。

## Acceptance Criteria

### Functional

- F1:`pnpm --filter @ai-km/model-readiness check-specs` 輸出 CPU 型號
  與執行緒數、總 RAM、GPU 型號與 VRAM(無 GPU 時明確顯示「未偵測到
  GPU,將以 CPU 推論」)、`models/` 分區可用空間,以及依規格產生的
  模型建議(含建議量化等級與是否可 GPU offload)。全部數值動態偵測,
  不寫死。
- F2:`models/` 內存在有效的 embedding GGUF 時,`verify-models` 能載入
  並對固定測試句(中文)產生 embedding 向量,報告維度且向量非全零。
- F3:`models/` 內存在有效的 LLM GGUF 時,`verify-models` 能載入並對
  最小中文 prompt 完成一次推論,報告非空回應與生成 token 數。
- F4:兩類模型任一缺檔時,`verify-models` 對該類輸出「缺檔 + 明確
  下載指引(指向 models/README.md)」,已存在的另一類仍照常驗證;
  整體 exit code 非 0(缺任一類即未就緒),但不得 crash。
- F5:`models/README.md` 載明建議模型表、Hugging Face 下載連結、
  預期檔名與放置路徑、以及驗證指令。

### Security / Authorization

- S1:腳本不得將規格資訊或任何資料上傳外部服務;唯一允許的網路行為
  是 node-llama-cpp 安裝期的官方 binary 下載。
- S2:`git status` 在放入模型檔後必須保持乾淨 —— `.gitignore` 生效,
  `*.gguf` 與 binary 快取不可能被 commit(以測試驗證 ignore 規則)。
- S3:腳本輸出與 EVIDENCE 不含任何 secret / token(Hugging Face 匿名
  下載即可,不引入需要 token 的模型)。

### Data / Contract

- D1:None — 不新增/修改任何 `contracts/` 內容。模型檔名與目錄約定
  只存在於本 story 的文件與腳本,不構成跨組 contract;Team B 未來
  RAG story 若要沿用,屆時再正式立約。

### UX(CLI 輸出)

- U1:成功 / 失敗 / 缺檔三態訊息明確可辨(繁體中文),缺檔訊息包含
  可直接照做的下一步(下載連結 + 目標路徑)。
- U2:規格不足以跑建議模型時(如 RAM < 8GB),`check-specs` 明確警告
  並降級建議,不得靜默。

## 驗證 Gate(STORY_WORKFLOW Phase 3 對應)

- L0 `pnpm typecheck` / `pnpm lint`:必須 0(新 workspace 一併納入)。
- L1 `pnpm test`(unit):腳本邏輯以 vitest 覆蓋(規格解析、建議
  邏輯、缺檔分支、.gitignore 規則);**模型載入/推論部分屬 L3**。
- L2 contract test:N/A(無 contract)。
- L3 integration:`verify-models` 對實際下載的 GGUF 跑真實載入與推論
  (mock 不算;模型未下載前此 gate 記錄為「待使用者下載後執行」,
  story 不得在 L3 未以真實模型通過前標 DONE)。
- L4 security-negative:S2 的 ignore 規則測試。
- L5 E2E:N/A(無瀏覽器流程)。

## 開發邊界備註

- 一個 branch:`story/LOCAL-S001-model-readiness`。
- node-llama-cpp 版本鎖定於 lockfile;若其 prebuilt binary 在本機
  無法載入(glibc/CUDA 相容性),記錄實測錯誤並轉 BLOCKED 回報,
  不得改用 mock 充當 L3 證據。
