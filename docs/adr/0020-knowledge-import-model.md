# ADR 0020: 知識匯入的格式清單與單一入口(NotebookLM 式來源選擇)

Status: Accepted · 2026-09-05 · **裁決人:使用者**(對照 `AI KM系統提案說明` 逐條回覆)。

## Context

協調者讀提案時發現自己把格式清單記錯,並且對「要不要拿掉文字輸入」與提案衝突,
逐條問使用者後得到裁決。**這份 ADR 取代協調者先前在 `DECISIONS_NEEDED` #28／#29 寫的內容。**

## Decision

### D1 — 支援格式(提案 + 使用者追加)

| 來源 | 格式 |
|---|---|
| 提案 p.3「檔案處理能力」 | `pdf`、`doc`、`ppt`、`xls`、`txt` |
| 提案 p.6「AI 資料來源管理」 | `CSV`、`PDF`、`Image` |
| **使用者 2026-09-05 追加** | **`md`** |

**完整清單**:`pdf`、`doc`、`ppt`、`xls`、`txt`、`csv`、`md`、`image`。

**協調者先前記錯的地方,明寫出來**:`DECISIONS_NEEDED` #29 曾寫成「`pdf、md`」——
`md` 當時是使用者的**口語舉例**,協調者把它當成規格寫進紀錄,而真正的提案清單有五種且不含 `md`。
**現在 `md` 是規格了(使用者追加),但那不能回頭讓當初的記錄變成對的。**

**實作現況**:`services/ingestion/src/extraction/` 底下**只有 `pdf-extract.ts`**——**八種格式只做了一種**。

**優先序(協調者建議,使用者未反對即採用)**:
`pdf`(已有)→ `txt` / `md` / `csv`(純文字,最小)→ `doc` / `ppt` / `xls`(要 Office 解析)
→ `image`(要 OCR 或多模態,最大,且與提案的「選擇 AI 模型(文字/圖像)」相關)。

### D2 — 匯入方式:**五種都留**,但收進**單一入口 + 一排來源按鈕**

使用者原話:「**可以加,但是要加上選擇的按鈕,模仿 Google NotebookLM**」,並附了 NotebookLM
「新增來源」對話框的截圖:一個對話框、一個拖曳區、底下一排來源類型按鈕
(上傳檔案 / 網站 / 雲端硬碟 / Play 圖書 / 複製的文字)。

**所以先前 `DECISIONS_NEEDED` #28「拿掉文字輸入」不執行**——使用者看過提案後改了主意:
問題不是「文字輸入不該存在」,是**三個獨立元件散在頁面上,看不出哪個是主要動作**。

提案 p.2 的五種匯入方式對到的按鈕:

| 提案的匯入方式 | 入口 |
|---|---|
| 上傳檔案(文件) | **上傳檔案**(拖曳區也走這條) |
| 上傳目錄(批次上傳資料夾中的所有資料) | **上傳檔案**旁的第二個入口(既有元件已有「上傳資料夾」) |
| 同步目錄(可更新目錄中新的資料) | **同步目錄**(既有 `folder-sync/` 頁) |
| 輸入網址 | **網站** |
| 新增文字內容 | **複製的文字** |

**雲端硬碟 / Play 圖書不在提案裡,不做**(那是 NotebookLM 自己的來源,不是我們的需求)。

**這是 UI 重組,不是新功能**:三個既有元件(`KnowledgeDocumentUpload`、
`KnowledgeDocumentUrlImport`、`KnowledgeDocumentTextInput`)的行為不變,
改的是**它們怎麼被呈現**——收進一個「新增來源」入口,拖曳區為主、按鈕列為輔。

### D3 — 上傳要有 `accept=` 與明確的格式提示

今天的 `<input type="file">` **沒有 `accept=` 型別限制**。D1 的清單一旦定了,
UI 就該擋住清單外的檔案,並在拖曳區直接寫出支援哪些格式(NotebookLM 那張圖也是這樣做的)。

**這是 fail-closed**:UI 收得下、管線處理不了,而中間沒有東西擋,是 §5.1 的形狀。

## 落點

`08-knowledge-management/phase-2`(那個 phase 本來就要「接真 API」)。
D1 的抽取器是 `05-ingestion` 的新交付,**與 D2/D3 不同 phase**——
UI 擋住格式(D3)可以先做,抽取器逐格式補。

## Consequences

- **提案 p.2 與 story E05-S015 不被 supersede**——五種匯入方式全留。
  先前 #28 的「拿掉」不成立,已在該列註明。
- `08` phase-2 的範圍變大(UI 重組),但**沒有新功能**,三個元件的行為不變。
- I4(UI 上傳與文件狀態)之前,D3 一定要做,否則使用者會上傳一個管線處理不了的檔。

## Related

`AI KM系統提案說明` p.2/p.3/p.6、`DECISIONS_NEEDED` #28/#29(被本 ADR 取代)、
story E05-S011~S015(封存規格庫)、`08-knowledge-management/FEATURE.md`。

---

## 2026-09-05 追加:抽取器選型裁決(技術顧問 ai-km-1b)

**anydoc 做 `doc`/`ppt`/`xls`/`csv`/`txt`/`md`;PDF 維持 `pdf-extract.ts`;docling 不進 I4。**

**理由**:anydoc 是 **Node binding、行程內**,符合 ADR 0007 的 in-process 主路徑;
docling 是 Python,要像 `whisper-server` 一樣開 sidecar——**那是第二個 runtime**,
留到真的需要影像 OCR(D1 的 `image` 格式)那個 phase 再評,並比照 ADR 0004 的 sidecar 形狀。

**四個條件,缺一這條裁決作廢**:

1. **版本釘死**,native binary 要在 **Node 22 + on-prem 目標(linux x86_64)實測能裝**
   ——裝不起來這條裁決**作廢回來重裁**(不是想辦法繞過)。
2. 確認 **npm 上有發布的 binding 與 LICENSE 檔**,不是只有 repo。
3. **每種格式各一條 I1 形狀的性質場景**:「引用 slice 回**儲存的抽取文字**逐字相等」
   ——抽取文字就是儲存的原文(見 `DECISIONS_NEEDED` #36,協調者查對了)。
4. **文件 metadata 要記抽取器名稱與版本。**
   **這一條是 #36 真正剩下的風險,不是「指不回去」**:抽取器升版會讓**同一份檔的 offset 漂移**,
   **舊文件不重抽就不能換版**。沒有記版本,升版那天沒有任何東西會發現引用開始指錯地方。

**分級:標準級。落點**:`05-ingestion` 新 phase,**排在 I4 前**,依本 ADR D3。
意圖句:「**一個人上傳 docx/pptx/xlsx/csv/txt/md 任一種,問問題時引用能開回原文段落。**」

---

## 2026-09-05 spike 結果:條件 1 與決定性測試通過;**外加一條硬禁令**

`05-anydoc-spike`(orca worktree,Sonnet)實測,不是讀 README:

| 條件 | 結果 |
|---|---|
| **1. Node 22 + linux x86_64 裝得起來、跑得動** | ✅ **通過**,三種格式(docx / xlsx / csv)都轉出 Markdown |
| **決定性:同檔轉兩次逐字相同** | ✅ **通過**,而且是**兩個獨立 node 行程**各跑一次比 sha256(排除 process 內快取的假陽性)。docx `a635dc9e…`、xlsx `6d9fee69…`、csv `44496b5f…` 三組前後一致。**沒有時間戳、隨機 id、環境相依的漂移**——offset 不會因為轉換本身不穩定而漂移 |
| **2. npm 上有發布的 binding 與 LICENSE 檔** | ⚠️ **一半**:binding 有發布;**但 npm tarball 裡沒有 LICENSE 檔本體**,只有 `package.json` 的 `license` 欄位字串 + GitHub repo 上的 MIT LICENSE。spike **拒絕替顧問延伸解讀**這算不算作廢條件,交回裁決 |

### ⛔ 硬禁令:**絕不啟用 `ocr: 'hosted'`**

spike 沒被問就查到的:anydoc 對掃描版 PDF **預設拋 `NeedsOcr` 錯誤**,
**但可以設 `ocr: 'hosted'` 把整份文件送到 Firecrawl 的雲端 Parse API 做 OCR。**

**那會讓文件離開這台機器。** 對一個 on-prem、以「未授權資料不進 context/citation/export/log」
為鐵律的系統,這是**把整份文件送給第三方**——比鐵律 2 擋的任何一件事都嚴重。

**它預設不會發生,但「預設安全」不是守門。** spike 的原話值得照抄:

> 值得在 ADR 裡明講「絕不啟用 `ocr: 'hosted'`」,**而不是靠沒人設定這個選項的僥倖**。

**所以本 ADR 加第五個條件**:抽取器落地時,`ocr` 選項**必須顯式設成非 hosted 的值**,
並且要有一條**會紅的檢查**(不是註解)確認它沒有被設成 `'hosted'`。
掃描版 PDF 的 OCR 需求另案處理(D1 的 `image` 格式那輪),**不得用這條逃生門解決**。

### 另外三件 spike 發現、影響後續 phase 的

1. **napi-rs 的 optionalDependencies 分包**:主套件只有 57KB 膠水層,**真正的 8MB native binary
   在平台專屬子套件裡**。要做 air-gapped 部署或私有 registry mirror,**必須連 7 個平台子套件
   一起鏡像**,只鏡像主套件會在別的機器上裝不到 binary。**這條寫進 I9(on-prem 部署)的 gate。**
2. **CSV 是唯一需要明講格式的**——其他格式靠檔案簽章自動偵測,CSV 沒有簽章。
   若管線是「檔案進來自動判斷格式」,**CSV 要用副檔名兜底**,不能沿用其他格式的偵測邏輯。
3. `engines.node >= 20`,不是綁死 22——未來 Node 升級風險低。
