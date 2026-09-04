# 05 · ingestion

## 一句話

一份真實的 PDF 進來,變成可以被檢索的 chunk,而且每一段都還記得自己原本在文件的第幾個字元;
抽不出字、沒有部門、換了部門、說不出自己用了哪個模型的,一律當場拒絕,不會安靜地存成
「索引了 0 個 chunk」。

## owner

待指派(phase-1 回填 2026-09-04)。

## 範圍

- PDF 文字抽取(`extractPdfText`,E06-S008):保留字元偏移量、非內嵌 CJK 字型也要抽得出真實中文、
  `extractorVersion` 與 `text` 一起回傳、golden sha256 逐位元穩定
- 切塊(`chunkDocument`,E06-S022):偏移量指回原文、chunk id 穩定、硬切要被標記
- 索引管線(`createIngestionService().ingest()`,E06-S042):parse → chunk → embed(**經 model
  gateway in-process**,ADR 0007 §1)→ store
- 寫入路徑的 embedding 身分(E06-S026):每個 `VectorRecord` 帶著 `embeddingModel` /
  `embeddingDimensions`;gateway 報不出身分就拒絕寫入,不補預設值
- 寫入路徑的 fail-closed 拒絕:空 scopeKey(`IngestionScopeError`)、空抽取(`PdfEmptyTextError`)、
  加密(`PdfEncryptedError`)、切出 0 塊(`IngestionEmptyDocumentError`)
- 跨部門重匯拒絕(E06-S043,使用者 2026-09-03 已批):同一個 `documentId` 換 `scopeKey` 重匯 →
  `DocumentScopeConflictError`,原部門的可見內容一筆不變
- `ingestionPlugin`(E06-S041):`fp()` 包裝,decoration 對父實例可見

## 不在範圍

- 查詢時的授權過濾、排序、rerank(→ `06-retrieval`)
- 查詢時的 embedding 身分守門(`EmbeddingVersionMismatchError`,→ `06-retrieval`)
- 向量庫本身的實作與 `DocumentScopeConflictError` 的定義位置(型別與守門住在
  `services/retrieval/src/vector/store.ts`,domain 屬 `06-retrieval`;本能力是它的呼叫端)
- 上傳 UI、文件狀態列表(→ `08-knowledge-management`)
- 非同步佇列、`apps/worker-ingestion`(目前 0 行,→ phase-3)
- 真模型 embedding(PF3,→ `04-model-gateway`,等 E04-S037)
- OCR、非 PDF 格式

## 來源

- 契約:無直接 HTTP 契約(in-process 接縫,ADR 0007);寫入的記錄型別是
  `services/retrieval/src/vector/store.ts` 的 `VectorRecord`
- 舊 story(素材,不是規格):E06-S008、E06-S022、E06-S026、E06-S041、E06-S042、E06-S043
- 整合點:[i1-real-pdf-citation.feature](../../docs/integration/i1-real-pdf-citation.feature)

## 單獨執行

```bash
pnpm --filter @ai-km/features accept --tags '@ingestion and @standalone and not @manual'
```

預期輸出:`10 scenarios (10 passed)`。全部 in-process、假 embedding provider(PF1)、in-memory
store、repo 內的三份 fixture PDF,不需要 DB、不需要模型、不開 port。

> **注意**:根目錄 `standalone.json` 的 `05-ingestion` 指令目前寫成
> `pnpm --filter @ai-km/features accept -- --tags '…'`。pnpm 11.9.0 會把那個 `--` 原樣轉給
> cucumber-js,cucumber 當成一個檔案路徑,`ENOENT` 退出碼 1(2026-09-04 實測,對 `06-retrieval`
> 那條也一樣)。見下方「待協調」。

## 依賴

**phase-1(回填)**:只依賴 `services/ingestion/src`、`services/model-gateway/src`
(deterministic provider)、`services/retrieval/src`(`VectorRecord` / in-memory store)。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(一條把 fixture PDF 索引進 dev DB 的指令) | I1 已通過(已);`06-retrieval` phase-2 | I2 要有東西可問,索引結果得落在 apps/api 用的那個 store |
| phase-3(非同步、失敗原因落庫) | I2 通過;`08-knowledge-management` phase-2 | 上傳 UI 要看得到「排隊／處理中／可問／失敗原因」 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `services/ingestion/src` |
| PDF | `pdfjs-dist@6.3.289` legacy build + 自家 join rules v1 | `extractorVersion` 由兩者組成 |
| 測試 | vitest 6 檔 + cucumber `phase-1.feature` 10 場景 + 手動反向驗證 | |
| 級別 | **嚴格** | 重匯拒絕觸及資料可見性;抽取／embedding 身分的失敗模式是「靜默給出錯誤結果」 |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)PDF 抽取(offsets、golden hash、空檔／加密拒絕)、chunk、embed、store、重匯拒絕 | I1 | in-progress | |
| 2 | 一條把 fixture PDF 索引進 dev DB 的指令,讓 I2 有東西可問 | I2 | todo | |
| 3 | 非同步、`apps/worker-ingestion`、失敗原因落庫 | I4 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The capability runs on its own | `plugin.test.ts`: AC-IS1 ★ app.ingestion 對 SIBLING 可見、AC-IS4 可注入替代實作;`pipeline.test.ts`: W1-00(`pageCount` = 2、`store.count()` = `chunkCount`) |
| A citation cut out of the stored text is the chunk word for word | `pipeline.test.ts`: W1-00 ★ 引用偏移量逐字指回原文;`extraction/pdf-extract.test.ts`: AC1、AC3(非內嵌字型的中文要抽得出來) |
| The same PDF read twice produces the same characters as the day the golden hash was taken | `extraction/pdf-extract.test.ts`: AC6 逐位元穩定性(golden sha256)、AC2 `extractorVersion`、AC5 決定性 |
| A scanned image-only PDF is refused instead of quietly indexing nothing | `extraction/pdf-extract.test.ts`: AC4a;`pipeline.test.ts`: 純圖片 PDF → fail closed |
| A password-protected PDF is refused rather than opened with a guessed empty password | `extraction/pdf-extract.test.ts`: AC4b |
| Re-importing a stored document under another department leaves the first department's view untouched | `pipeline.test.ts`: E06-S043 AC1+AC2 ★ 透過真實 `ingest()` 入口重匯 |
| Every stored chunk carries the identity of the model that embedded it | `embedding-identity.test.ts`: AC1 ★ model/dimensions 逐值寫進每個 `VectorRecord` |
| A gateway that cannot name its embedding model gets nothing written | `embedding-identity.test.ts`: AC2 ★ 空字串 model → 拒絕寫入,store 保持空 |
| A document handed in without a department is refused before any work is spent on it | `pipeline.test.ts`: scopeKey 為空 → 拒絕寫入,store 保持空 |
| Re-cutting the same document keeps every citation id and boundary where it was | `chunking/chunk.test.ts`: PF0 chunk id 必須穩定、PF0 偏移量必須能從原文精確切出 chunk 內容 |

## 驗收方式

- 自動:`pnpm --filter @ai-km/features accept --tags '@ingestion and @phase-1'` → `10 scenarios (10 passed)`。
- 反向驗證(2026-09-04,回填時手動做,`tools/mutate.mjs` 只驅動 vitest 所以不適用 cucumber 層):
  - **(a) 拿掉跨部門重匯守門**:`services/retrieval/src/vector/store.ts` 的
    `checkDocumentScopeConsistency()` 開頭加一行早退 → 「Re-importing a stored document under
    another department…」紅在**第一條資料比對**(finance 重匯前後看到的 chunk 不同),不是紅在
    「有沒有拋錯」。還原後 sha256 相同、10/10 綠。
  - **(b) 把空 scopeKey 的守門移到 embed 之後**:`services/ingestion/src/service.ts` → 「A document
    handed in without a department…」紅在 `the "embedding" provider is never called`。這條專門
    證明那個共用斷言**不是空的**——沒有它,一個「先算完再拒絕」的管線在自動檢查下與正確的無法區分。
- `@manual`:無。本能力所有場景都在 `not @manual and not @e2e` 之下跑得動。

## 待協調

(共用檔只有協調者能改;以下是本輪撞到、但我沒有動的東西。)

- `features/steps/common.steps.ts`:`When("the {string} plugin is registered on a bare server and
  the server becomes ready", …)` 的 cucumber expression 有一個 `{string}` 參數,但 handler 宣告
  `function (this: KmWorld)`(0 個參數),cucumber 直接拒絕:
  `function has 0 arguments, should have 1 (if synchronous or returning a promise) or 2 (if accepting a callback)`。
  2026-09-04 實測,在此之前沒有任何 `.feature` 用過這句,所以沒人踩到。
  **建議措辭**:handler 改成 `async function (this: KmWorld, _name: string)`(名字只是給場景讀的,
  真正要註冊什麼仍由 `this.bag["pluginUnderTest"]` 決定)。修好之後本資料夾可以把自己的
  「the ingestion plugin is registered on a host application and that application becomes ready」
  換回通用句。
- `standalone.json`(9 條非互動指令)、`features/06-retrieval/FEATURE.md`、`features/README.md`、
  以及回填 brief 裡的驗收指令都寫成 `pnpm --filter @ai-km/features accept -- --tags '…'`。
  pnpm 11.9.0 會把那個 `--` **原樣**轉給 cucumber-js,cucumber 當成一個檔案路徑:
  `ENOENT: no such file or directory, open '…/features/@retrieval and @standalone and not @manual'`,
  退出碼 1。**建議措辭**:把 `-- ` 拿掉(`pnpm --filter @ai-km/features accept --tags '…'`,
  2026-09-04 實測 `9 scenarios (9 passed)`)。這條會讓 `/phase-done` 的「單獨執行 exit 0」對
  **每一個**資料夾都假紅,不只本資料夾。
- `features/steps/integration.steps.ts`:屬於 ingestion 的句子(`the model gateway uses the
  deterministic embedding provider`、`an in-memory vector store`、`the real Chinese fixture PDF is
  ingested under department {string}`、`the real Chinese fixture PDF is ingested with an empty
  department`、`the vector store is still empty`)目前住在那裡,本資料夾**原文沿用、不重新定義**。
  搬家到 `features/steps/ingestion.steps.ts` 由協調者在合併點做(顧問 2026-09-04 裁決)。
  搬完之後本檔的 `this.bag["i1"]` / `this.bag["ingestion05"]` 兩個袋子可以併成一個。
- `pnpm --filter @ai-km/features steps:dup` 因為上一條而**紅**:上述 5 句同時出現在
  `features/05-ingestion` 與 `docs/integration` 兩個分組,而它們定義在 `integration.steps.ts`
  不是 `common.steps.ts`。協調者已預告這是守門本身要調整的地方。

## 開放問題

- 反向驗證 (a) 拿掉的是 `checkDocumentScopeConsistency` 整個函式的判斷,兩個 store
  (in-memory 與 sqlite-vec)共用它,所以只證明了「共用的那一層缺了會響」。**in-memory store 自己
  在 `upsert` 裡另有一段「先驗證全部再寫任何一筆」的順序保證,本輪沒有單獨對它做窄突變**;
  下次補一個只把 Phase 1/Phase 2 順序對調的突變,證明「部分寫入」也會被抓到。
- `IngestionEmptyDocumentError`(抽取非空但整份都是空白字元 → 切出 0 塊)**沒有任何 fixture
  打得到**——三份 fixture 沒有一份會落在那條路徑上,既有 vitest 也沒有測它。本 phase 不為了
  補一個場景去造 fixture(那會變成為守門而造資料),登記在這裡,等有真實文件觸發時再補。
- 「把文件從 A 部門移到 B 部門」是否為合法操作,仍是 `docs/DECISIONS_NEEDED.md` 第 1 條的待批示;
  在那之前重匯一律拒絕,本 phase 的場景就是按這個現況寫的。
