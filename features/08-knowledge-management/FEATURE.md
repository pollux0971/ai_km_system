# 08 · knowledge-management

## 一句話

一個人建立知識庫、搜尋它、把檔案／網址／打字進去的內容放上架,並且對其中一份文件做的事
(改名、重試、封存、刪除)永遠不會跨到別的知識庫的架子上。

## ⚠️ 這一層目前整個是 mock,不是整合證據(鐵律 5)

`contracts/openapi/` **沒有任何 knowledge 路徑**,`apps/api` 沒有任何 knowledge route,
真正的 Document 實體屬於 **E06(Team B,未建)**。phase-1 的全部行為都跑在 `apps/web` 的
瀏覽器端 mock 層(`src/lib/knowledge-bases.ts`、`src/lib/knowledge-documents.ts`,session
storage 後端)。

**場景全綠代表「瀏覽器端這個能力照規格行為」,不代表「知識管理已經接上任何後端」。**
`.feature` 檔的 Feature 敘述把這句話寫在最上面,不靠這份文件轉述。

## owner

待指派(2026-09-04 回填)。

## 範圍

- 知識庫清單與依名稱搜尋(`listKnowledgeBases`,E05-S001/S002)
- 一個知識庫的文件清單,含「封存／未封存」兩個互斥檢視(`listKnowledgeBaseDocuments`,E05-S010/S025)
- 三種上架來源:檔案上傳(`addKnowledgeBaseDocument`,E05-S011～S013)、網址匯入
  (`addKnowledgeBaseDocumentFromUrl`,E05-S014)、直接打字(`addKnowledgeBaseDocumentFromText`,E05-S015)
- 文件層動作:改名(S023)、重試處理失敗(S021)、封存／取消封存(S025)、刪除(S026)、
  文件層可見角色(S027)——**每一個都帶「跨知識庫即 NOT_FOUND」的守門**
- 模擬處理失敗的觸發字串受 `mock_triggers` 旗標管制(E03-S045),預設關閉
- 知識範圍(`KNOWLEDGE_SCOPES`)與檔案大小顯示等純函式

## 不在範圍

- 真正的上傳 API、物件儲存、抽取／切塊／向量寫入(→ `05-ingestion`、E06,Team B)
- 用文件回答問題(→ `06-retrieval`、`07-generation`)
- 真的權限強制點——文件層的 `visibleToRoles` 目前只是設定值,沒有任何檢索會讀它
  (→ `02-authorization`)
- 頁面的視覺與互動細節(React 元件、Playwright)——見下方「沒有回填進 phase-1 的」

## 來源

- 契約:**無**(`contracts/openapi/` 沒有 knowledge 路徑;這是這個資料夾最大的缺口)
- 舊 story(素材,不是規格):E05-S001～S027、E03-S045
- 實作:`apps/web/src/lib/knowledge-bases.ts`、`apps/web/src/lib/knowledge-documents.ts`、
  `apps/web/src/app/(app)/knowledge/**`
- 既有測試:`apps/web/src/lib/knowledge-bases.test.ts`(732 行)、
  `apps/web/src/lib/knowledge-documents.test.ts`(851 行)、
  `tests/e2e/specs/knowledge-*.spec.ts`(15 個 spec)

## 單獨執行

根目錄 `standalone.json` 的 `08-knowledge-management` 是 **interactive**
(`pnpm --filter @ai-km/web dev`),所以「單獨跑起來」那一條在本資料夾是 `@manual` 場景,
`/phase-done` 的自動單獨執行檢查對它不適用。

自動可跑的那一條(回填實際用的指令):

```bash
pnpm --filter @ai-km/features accept --tags '@knowledge-management and @phase-1 and not @manual and not @e2e'
```

預期輸出:`11 scenarios (11 passed)`。純 in-process,不開 port、不連 DB、不需要瀏覽器。

> **注意(2026-09-04 實測)**:`standalone.json` 與 `features/06-retrieval/FEATURE.md` 寫的
> `pnpm --filter @ai-km/features accept -- --tags '…'` 在 **pnpm 11.9.0 下會失敗**——`--`
> 會被原樣傳給 cucumber-js,tag 運算式被當成檔案路徑(`ENOENT: … features/@retrieval and @standalone…`)。
> 06-retrieval 那條指令一樣壞。去掉 `--` 就正常。見「待協調」第 2 條。

## 依賴

**phase-1(回填)**:只依賴 `apps/web/src/lib/knowledge-bases.ts`、`knowledge-documents.ts`、
`feature-flags.ts`。沒有 service、沒有 contract、沒有 DB。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2(上傳與文件狀態接真 API) | 一份 knowledge/documents 的 OpenAPI 契約(目前不存在,要走 `/decide` + 使用者)、`05-ingestion` phase-3(async worker、失敗原因落庫) | 現在整層是 mock;沒有契約就沒有「接」的對象 |
| phase-3(頁面層的 Gherkin) | features runner 有瀏覽器環境(jsdom 或把 Playwright 接進 `@e2e` job) | React 元件與頁面互動在 node 底下驗不了 |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | `apps/web/src/lib/*` |
| 測試 | vitest(`knowledge-bases.test.ts`、`knowledge-documents.test.ts`、各元件 `.test.tsx`)+ Playwright 15 個 spec + cucumber `phase-1.feature` 12 場景 | |
| 級別 | **標準** | 見下 |

**分級理由(標準級)**:這一層沒有真正的授權判斷——文件層的 `visibleToRoles` 是純設定值,
`apps/web` 裡沒有任何地方會依它擋掉資料(模組自己的註解也這麼寫)。失敗模式也不靜默:
跨知識庫守門壞掉時,別的知識庫的文件會**改名／消失**,是逐字可比對的量(反向驗證第一段
就是這個)。**但有一個前提**:一旦 phase-2 把它接到真的 API 與真的 RBAC,這個資料夾
**必須重新分級為嚴格**——那時「文件對誰可見」就是真的資料可見性了。

## Phase

> **2026-09-04 協調者補**:這個資料夾的 `FEATURE.md` 原本**漏了 Phase 表**——而 Phase 表是
> GHERKIN_WORKFLOW §1 指定的**唯一狀態來源**。漏了它,這個資料夾的狀態就只存在於
> `docs/01-roadmap.md`(那是現況總覽,不是狀態來源)。補上,內容以 main 上的實際情況為準,
> 不是重新裁定。

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)知識庫清單、文件清單與狀態、跨知識庫守門、feature flag(**目前對 mock**) | I1 | in-progress | |
| 2 | 上傳與文件狀態接真 API(接上後本資料夾**重新分級為嚴格**) | I4 | todo | |
| 3 | 頁面層的 Gherkin(需要 DOM 環境) | 待定 | todo | |

**phase-1 狀態細節**:場景與實作已合併進 main,`/phase-done` 尚未跑完 → `in-progress`。
本資料夾是**標準級**(理由見上),依 §5.1 可由協調者自審,不需要另一個 session。

**phase-2 的 gate(2026-09-04 更新)**:原本寫「需要一份 knowledge 契約,走 `/decide` + 使用者」。
**ADR 0013 已把新 endpoint／新 schema 從使用者級改為技術顧問級**,並在其裁決表 #8 明白授權
協調者起草 `contracts/openapi/knowledge.yaml`(最小:upload、list、document status、delete、re-index),
走 `/decide` Proposed → 顧問批 Accepted。同表 #9 裁定文件層與知識庫層的 `visibleToRoles`
**取交集**(兩層都允許才可見)。所以 phase-2 的契約 gate **不再卡在使用者**,卡在「契約還沒起草」。

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| The knowledge library comes up on its own… | `lib/knowledge-bases.test.ts`: listKnowledgeBases 回傳 3 個樣本知識庫;`lib/knowledge-documents.test.ts`: "returns the 3 seeded documents for kb-sample-1, each with the expected fields" |
| Searching the library by name narrows it… | `lib/knowledge-bases.test.ts`: E05-S002 依名稱搜尋(只比對 name,不比對 description) |
| A rename aimed through the wrong knowledge base… | `lib/knowledge-documents.test.ts`: renameKnowledgeBaseDocument "returns NOT_FOUND when the document exists but belongs to a different knowledge base";listKnowledgeBaseDocuments "never returns a document belonging to a different knowledge base" |
| An uploaded file lands on that knowledge base's shelf… | `lib/knowledge-documents.test.ts`: addKnowledgeBaseDocument(E05-S011)記錄 name/sizeBytes 並出現在清單 |
| A blank file name is refused… | `lib/knowledge-documents.test.ts`: addKnowledgeBaseDocument 空名稱 → VALIDATION_ERROR「檔案名稱不得為空。」 |
| Uploading into a knowledge base that does not exist… | `lib/knowledge-documents.test.ts`: addKnowledgeBaseDocument 不存在的 KB → NOT_FOUND(fail closed) |
| An address that is not a web page is refused… | `lib/knowledge-documents.test.ts`: addKnowledgeBaseDocumentFromUrl(E05-S014)非 http(s) → VALIDATION_ERROR「只支援 http(s) 網址。」 |
| An imported link records no size while typed-in text… | `lib/knowledge-documents.test.ts`: URL 匯入省略 sizeBytes;addKnowledgeBaseDocumentFromText(E05-S015)`new Blob([content]).size` 是真值 |
| The simulated processing failure only reaches a document… | `lib/knowledge-documents.test.ts`: "stamps status:failed when the name contains MOCK_DOCUMENT_PROCESSING_FAILURE_TRIGGER" 與 "ignores … when mock_triggers is disabled"(E03-S045) |
| Retrying a document that never failed… | `lib/knowledge-documents.test.ts`: retryDocumentProcessing "returns VALIDATION_ERROR when attempting to retry a document that isn't currently failed" |
| (`@manual`)The knowledge library page comes up… | 無自動測試;`standalone.json` 的互動式指令,人眼確認 |
| (`@e2e @manual`)A person uploads a file on the knowledge base page… | `tests/e2e/specs/knowledge-documents.spec.ts`、`knowledge-list.spec.ts`(Playwright,cucumber runner 沒有瀏覽器,故同時標 `@manual` 讓裸跑 `accept` 不產生 undefined 噪音——與 `docs/integration/i1-real-pdf-citation.feature` 的 `@e2e @manual` 同一個做法) |

## 步驟層的一個自主判斷:session storage

`knowledge-bases.ts` / `knowledge-documents.ts` 的 `readStore()`/`writeStore()` 用
`typeof window === "undefined"` 判斷有沒有瀏覽器:沒有時讀固定樣本、**寫入靜默 no-op**。
apps/web 的 vitest 跑在 **jsdom** 底下,拿到 jsdom 的 `window.sessionStorage`;features 的
runner 是 node + tsx,**沒有 jsdom,也不准自己加依賴**。

所以 `features/steps/knowledge-management.steps.ts` 在 **scenario 期間**掛一個 Map 後端的
`window.sessionStorage`(`After` 只拆自己裝的那一個)。**被驗的邏輯一行都沒被替換**——過濾、
跨知識庫守門、驗證、旗標全走真實程式碼;換掉的只是瀏覽器提供的儲存體本身,讓模組走的是與
vitest 完全相同的那條路徑,而不是「沒有瀏覽器」的退化分支。若不裝,`writeStore` 會靜默
no-op,「上傳後文件在架上」這類場景會變成假綠。

## 驗收方式

- 自動:上方「單獨執行」那條指令,`11 scenarios (11 passed)`。
- `@manual`:兩條(dev server 開頁面、瀏覽器上傳),由使用者親眼確認;`@e2e` 那條的機器
  對應物是 Playwright 的 `knowledge-*.spec.ts`,在 CI 的 e2e job 跑,不在 accept job。
- 反向驗證(2026-09-04,回填時做,兩段):
  1. `apps/web/src/lib/knowledge-documents.ts:382`(`renameKnowledgeBaseDocument` 的跨知識庫
     守門)去掉 `&& document.knowledgeBaseId === knowledgeBaseId` → 「A rename aimed through
     the wrong knowledge base…」紅在**第一條決定性斷言**:
     `知識庫 kb-sample-2 的文件應為 [設備故障排除手冊.pdf],實際是 [改名嘗試.pdf]`
     ——別的知識庫的文件真的被改掉了,不是「有沒有拋錯」。
  2. 同檔 `:288` 去掉 `isFeatureEnabled("mock_triggers") &&` → Scenario Outline 的
     `off` 那一列紅:`文件「毀損報告[模擬:KB_PROCESSING_FAILED].pdf」的處理狀態應為 ready,實際是 failed`
     ——這一段對著 PITFALLS 坑 2(「守門有沒有被接上」與「守門會不會紅」是兩件事)。
  兩段都還原並以 `sha256sum` 逐位元驗證(`c31ee260…3a076` 前後相同),還原後 11/11 綠。

## 待協調(要協調者改共用檔的,我沒有動)

1. **`features/tsconfig.json` 的 `lib` 沒有 `DOM`**,而 `apps/web` 的 mock 層有裸 `window`
   參照,直接 import 會 `TS2304: Cannot find name 'window'`(8 條)。我在自己的步驟檔用
   最小的 `declare global { var window: { sessionStorage: … } | undefined }` 解掉。
   **11 個 UI 資料夾都會踩到同一個坑,而兩份不同型別的 `declare var window` 會 TS2403 互撞。**
   建議二選一:(a) `features/tsconfig.json` 的 `lib` 加 `"DOM"`;(b) 把這段 `declare global`
   移進 `features/steps/_world.ts` 由協調者維護一份。措辭可直接抄我步驟檔第 42–53 行(`SessionStorageLike` + `declare global`)。
2. **`standalone.json` 兩件事**:
   (a) 所有 `accept -- --tags '…'` 形式的指令在 **pnpm 11.9.0 下會失敗**(`--` 原樣傳給
   cucumber-js,tag 運算式被當路徑)。10 個 key 都受影響,`06-retrieval` 已實測會紅。
   建議把 `-- --tags` 一律改成 `--tags`。
   (b) `08-knowledge-management` 目前是 `interactive: true`,`/phase-done` 沒有可自動驗的
   單獨執行入口。建議另加一個 key(例如 `08-knowledge-management-accept`)指向
   `pnpm --filter @ai-km/features accept --tags '@knowledge-management and @standalone and not @manual and not @e2e'`,
   `expect: "11 scenarios (11 passed)"`;或把本 key 改成該指令、把 dev server 留在 FEATURE.md 裡。
   **兩者都要動 `standalone.json`,我沒有動。**
3. `features/README.md` 的索引表把 08 的單獨執行寫成「同上模式」,實際上是互動式;等第 2 條
   定案後一併修。

## 開放問題

- **沒有契約**。`contracts/openapi/` 完全沒有 knowledge 路徑,phase-2「接真 API」沒有對象。
  這要走 `/decide` 開一份 ADR(新 endpoint + 新 schema → **使用者拍板**,CLAUDE.md 決策權表)。
- **文件層 `visibleToRoles` 是空頭支票**:設定得下去,但沒有任何地方會依它擋資料。
  phase-2 之後這會變成真的資料可見性,屆時本資料夾要升為嚴格級(見「技術棧」)。
- **跨知識庫守門有 5 份逐字相同的 `store.find(... && knowledgeBaseId ...)`**
  (`:336/:382/:413/:428/:500`)。回填只證明了 `renameKnowledgeBaseDocument` 那一份會紅;
  另外四份(retry / archive / unarchive / updateVisibleRoles)由 vitest 各自覆蓋,但沒有
  Gherkin 場景。要不要用 `Scenario Outline` 對五個動作各跑一次,phase-2 再議。
- `@manual` 場景 3 條步驟句子刻意**不定義**(README「只用在 `@manual` 場景的句子不要定義」)。
  若之後要把 dev-server 那條自動化,需要一個非互動的 smoke 指令。
