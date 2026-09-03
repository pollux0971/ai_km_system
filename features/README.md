# features/ — 按能力切的分階段 Gherkin 規格

一個資料夾 = 一個**能力**(使用者做得到的一件事所需的全部:service、contract、UI、E2E),
不是一個團隊、不是一層、不是一個 story。資料夾內按 phase 切,每個 phase 一個 `.feature`。
規則來源:ADR 0008。範式來源:`/data/python/llm_learning-cards`(使用者的敏捷範式)。

## 索引

| # | 能力 | 一句話 | Phases | 單獨執行(`standalone.json`) | owner |
|---|---|---|---|---|---|
| 01 | identity | 登入、session、sandbox 身分 | 1 | `pnpm --filter @ai-km/features accept -- 01-identity` | — |
| 02 | authorization | 部門／群組 → `RetrievalScope`(Deny-Wins) | 1 | 同上模式 | — |
| 03 | conversation | 對話、訊息、SSE 同步、修訂 | 1 | 同上 | — |
| 04 | model-gateway | embedding／generation／transcription 唯一入口 | 1 | 同上 | — |
| 05 | ingestion | PDF → 文字 → chunk → 向量(含版本 metadata) | 1 | 同上 | — |
| 06 | retrieval | scope 前置過濾、向量庫、rerank | 1 | 同上 | — |
| 07 | generation | context 組裝、引用回填、grounding 檢查 | 1 | 同上 | — |
| 08 | knowledge-management | 上傳、文件狀態、知識庫 UI | 1 | 同上 | — |
| 09 | feedback-analytics | OK/NG、原因、admin 指標 | 1 | 同上 | — |
| 10 | admin-console | 部門、群組、connector、health | 1 | 同上 | — |
| 11 | app-shell | 導覽、首頁、M3、跨視窗 | 1 | 同上 | — |
| 12 | audit-observability | 稽核紀錄、log、health | 1 | 同上 | — |

精確狀態看各 `FEATURE.md` 的 phase 表(**唯一狀態來源**)。下一步由各 `NEXT.md` 決定。
單獨執行指令的權威來源是根目錄的 `standalone.json`,上表只是方便閱讀。
資料夾會隨回填逐一建立;索引列了但目錄不存在的,表示還沒回填。

## 資料夾結構

```
NN-name/
├── FEATURE.md        範圍、不在範圍、依賴、技術棧、單獨執行、phase 表、回填對照表、owner
├── NEXT.md           ★ 目前狀態、下一個 phase 的 gate、gate 未滿足時該做什麼
├── phase-1.feature   回填:綁到既有測試的既有行為
└── phase-N.feature
```

新資料夾從 `_template/` 複製,**三個檔都要**。

## phase-1 的原則(本 repo 的 Wave 0 = 回填)

本 repo 的 phase-1 是**回填**:能力已經存在(253 個 approved story 的產物),phase-1 把它
「已經會做的事」寫成場景並綁到機器證據。

1. **每個場景都綁到既有測試同樣的入口**(真實 `buildServer()` inject、真實 service 函式),
   step 定義不是把 vitest 測試名貼進 Gherkin。綁不到既有測試的行為**不得寫進 phase-1**,寫進 phase-2。
2. **第一個場景固定是「這個能力單獨跑起來會怎樣」**。對 Fastify plugin 的定義:走真實
   `register()→ready()`、從父實例斷言 decoration(ADR 0007 §5)。
3. `FEATURE.md` 的「回填對照表」列出:場景名 → 它綁到的既有測試檔:測試名。這是回填不是
   模板的證據。
4. 每個資料夾至少一個場景做過 `tools/mutate.mjs` 反向驗證(改壞 → 該場景紅),證據進 commit body。
5. **不 import 其他能力資料夾的 steps**;共用句子只在 `steps/common.steps.ts`(協調者改)。

## 狀態

| 狀態 | 意思 |
|---|---|
| `todo` | 有 gherkin,gate 未滿足 |
| `ready` | gate 滿足,可挑進 sprint |
| `in-progress` | 本 sprint 在做 |
| `done` | 通過 `/phase-done` |
| `blocked` | 卡住,原因在 NEXT.md |

## Gherkin 慣例

全英文,cucumber 預設語言。檔頭第一行是 tags:

```gherkin
@i1 @retrieval @phase-1 @standalone
```

| Tag | 意思 |
|---|---|
| `@i1`..`@i9` | 屬於哪個整合點(phase-1 回填一律 `@i1`,表示 I1 之前已具備) |
| `@<feature-name>` | 哪個資料夾(與 `standalone.json` 的 key 尾碼一致) |
| `@phase-N` | 哪個 phase |
| `@standalone` | 不需要其他能力,`accept:phase1` 會跑 |
| `@manual` | 人眼確認,自動測試跳過 |
| `@e2e` | 走瀏覽器(Playwright,只在 CI),或整合點的「一個人做完一件事」場景 |
| `@regression` | 整合檔用:前一個整合點的能力沒被弄壞 |
| `@model` | 需要真模型(PF3),CI 跳過,本機不跑 |

規則:

- 一個場景只驗一件事;`Given` 設狀態、`When` 一件事、`Then` 只斷言
- 步驟用使用者看得懂的語言,不寫實作細節(不寫 "calls retrieve()",寫 "asks a question")
- 多個變體用 `Scenario Outline` + `Examples`,Examples 是真的值
- 場景名稱是一句敘述,不加編號、不加 story 編號
- **一個 phase 少於 3 個或多於 15 個場景都要懷疑**(少了沒想清楚,多了在寫模板)
- **反向驗證的斷言對著「壞掉時會變的量」**(分數、順序、內容、身分),不對存在性——
  這條從 STORY_WORKFLOW 原封搬來,是本 repo 用血換的
- `pnpm --filter @ai-km/features gherkin:dup` 會抓跨資料夾逐字相同的場景本體,CI 紅——
  這條直接對著舊規格 E04 那 36 條相同內文的病

## 步驟定義

`steps/`,一個能力一檔。同一句步驟在不同 feature 出現時共用同一個定義(cucumber 對重複定義
報錯,這是好事)。先讀 `steps/_world.ts` 再寫。**開發 agent 不改 `steps/**` 與 `*.test.ts`**
(ADR 0008 §4 角色分工;機械守門:branch diff 命中即退回)。

## 一個 phase 的大小

一個人加一個 agent 在 1–3 天內做完。超過就拆,少於半天就併。
