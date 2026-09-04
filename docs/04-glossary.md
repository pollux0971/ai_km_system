# 04 · 詞彙表(新範式用語,2026-09-04)

只收新範式(ADR 0008)之後常用、容易搞混的詞。舊 epic-story 用語見
`archive/AI_KM_BMAD_High_Granularity/policies/`(仍逐字複製在 `docs/policies/`)。

## scope

`RetrievalScope`:一個 branded type,代表「這次查詢當下這個人看得到哪些文件」。**在檢索之前**
由 `02-authorization`(或現階段的 demo 固定值)算出,`retrieve(question, scope, topK)` 只收它
作輸入,函式內部不得自行推導——這是 `06-retrieval` 的設計約束(E04-S062),不是實作細節。
向量庫用它做**前置過濾**(sqlite-vec 的 partition key),不是先撈全部再過濾。

## Deny-Wins

權限衝突(例如一個人同時屬於「可見」與「不可見」兩條規則)時,**預設拒絕**贏。這是 PD-06,
Wave 1 已驗證(`ADR 0010`),對應場景在 `features/06-retrieval/phase-1.feature`「Deny-Wins」
「empty scope returns nothing」。反向驗證:把判斷謂詞永遠改成放行,必須改壞成拋
`ScopeLeakError`。

## PF0–PF3(provider fidelity,provider 保真度)

衡量一次測試用的 embedding／generation provider 有多「真」的分級軸,與 L0–L6(見下)是**兩個
獨立的軸**,一個場景兩個都要標。本 repo 目前只看得到兩端的實際用法:

| 級別 | 意思 | 本 repo 的實例 |
|---|---|---|
| PF1 | deterministic/canned 假 provider,in-process,不呼叫任何外部服務 | `06-retrieval` phase-1 的假 embedding provider(`services/model-gateway` deterministic provider) |
| PF3 | 真模型(本機 bge-m3 embedding/rerank,或使用者接的遠端 generation) | E04-S037、ADR 0009;`@model` 場景 |

PF0、PF2 目前在活文件中**沒有找到實際用例**,`docs/policies/README.md` 只提過這是一條
「PF0–PF3」的軸,沒有寫每一級的定義——遇到需要用中間級距時先問技術顧問或 `/decide`,
不要自己猜一個定義寫死。

## L0–L6

`docs/policies/TESTING_POLICY.md` 的測試方法論分級,原封適用:

| 級別 | 意思 |
|---|---|
| L0 | 靜態:format/lint/type/schema |
| L1 | 單元:純規則、validator、reducer、guard |
| L2 | seam/contract:client↔API、service↔service、adapter↔provider |
| L3 | 整合:DB/object/vector/queue 邊界 |
| L4 | E2E:登入→授權任務→結果→引用/稽核 |
| L5 | 安全/對抗:權限被撤銷、跨 scope 存取、SQL injection、prompt/data leakage |
| L6 | RAG 評估:檢索召回率、引用正確性、abstention、禁止來源洩漏率 = 0 |

## phase

`features/NN-name/phase-N.feature`:一個能力資料夾裡,1–3 天做得完的一份 Gherkin。
**測試就是規格**——不另外寫 spec 文件。狀態(todo/ready/in-progress/done/blocked)記在
該資料夾 `FEATURE.md` 的 phase 表,那是狀態的唯一來源。

## 整合點(I1–I9)

`docs/integration/iN-*.feature`:好幾個能力資料夾的 phase 串起來後,**使用者做得到一件完整
的事**的驗收點。每個整合檔必有一個 `@e2e` 場景,由使用者親手確認,不能被測試代替
(Definition of Integrated)。I1–I9 嚴格依序,不可跳;見 `docs/01-roadmap.md` 的全貌圖。

## 回填(backfill)

Wave 0 之後,把已經寫好的 253 個舊 story 的實作,逐個資料夾補寫成 `phase-1.feature`
的過程——**不是重新驗收那 253 個 story 的每一條細節**,只證明「這個能力現在真的會做的事」
有機器可執行的證據。回填內部 12 個資料夾順序自由,狀態表見 `docs/01-roadmap.md`。

## 反向驗證(mutation verification)

把實作故意改壞,指定的場景／斷言**必須**變紅,還原後變綠,兩段輸出都要記錄。
優先用 `tools/mutate.mjs`(手動做要說明為何工具不適用)。斷言必須對著「壞掉時會改變的量」
(分數、順序、內容、身分),存在性斷言(有結果、長度>0、沒拋錯)不算。詳見
`.claude/rules/GHERKIN_WORKFLOW.md` §5.2。

## DECISIONS_NEEDED

`docs/DECISIONS_NEEDED.md`:唯一的「需要使用者決定的事」收件匣,取代舊範式的
`docs/stories/PENDING_DECISIONS.md`(2026-09-03 起凍結)。依 `CLAUDE.md`「決策權」段,
只有契約放寬/新 endpoint、新資料夾授權、付費或外部服務、真模型選型、以前沒提過的功能、
整合點驗收這幾類才進這裡;其餘由技術顧問或協調者自行裁決並記 ADR。協調者遇到這類事:
加一列,**不停下來等**,繼續做別的。

## owner

`FEATURE.md` 的一欄,取代舊範式「Team A／Team B 資料夾分工」(PD-34、PD-35,已推翻,
見 ADR 0008)。每個能力資料夾標一個 owner,決定誰能改它的實作;跨資料夾的改動一律走
`/feature` 分流,不是靠資料夾路徑判斷團隊邊界。
