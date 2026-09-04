---
description: 新需求分流(ADR 0008)。判斷該開新能力資料夾、改既有 gherkin、還是與 ADR／契約衝突。先提案、等確認、再寫檔。
---

# /feature — 新需求分流

需求:

> $ARGUMENTS

判斷它落在哪裡,然後**提案、等確認、再寫檔**。未經確認不得寫入任何檔案。

## 第一步:讀取現況

1. `contracts/openapi/*.yaml` 相關的那份——決定這個需求是否需要動契約
2. `docs/adr/` 每筆 ADR 的 Decision(至少 0003、0005、0007、0008)
3. `docs/01-roadmap.md` 的「現況」與「未排程」
4. `features/README.md` 索引
5. **每一個** `features/*/FEATURE.md` 的「範圍」與「不在範圍」
6. `.claude/rules/GHERKIN_WORKFLOW.md` §4、§5

## 第二步:拆解

把需求拆成獨立**能力**:可以用一句「使用者能夠 ___」描述、可以獨立驗收。
一句話一個能力就不要硬拆;「A 而且 B 而且 C」就拆三個分別判斷。

## 第三步:判定(按順序,命中第一個就停)

### E · 需要動契約 → 先問

命中:需要改 `contracts/openapi/*.yaml` 的 schema、新 endpoint、新 permission、改既有 fixture。
處理:明確說要改哪份 yaml 哪個 schema;列出哪些已 done 的 phase 需要重驗(compat gate、L2-EQ 會紅哪裡);
問「要改嗎?還是有辦法在現有契約下做?」;要改 → 先 `/decide` 記 ADR proposed → 使用者拍板 → 再回來重跑分流。
**鐵律 #1:不發明 contract。**

### C · 與既有決策衝突 → 不寫,問使用者

命中:與任何 Accepted ADR 矛盾(例:走 HTTP 呼叫 model gateway 違反 ADR 0007;在 retrieval 內推導 scope
違反 E04-S062 約束;建過渡 scope 對應表違反 E04-S009 裁示)。
處理:列出衝突的 ADR,問「要推翻嗎?」。要的話先 `/decide` 產生 superseding ADR。

### D · 跨能力 → 拆,再各自判定

命中:一個能力需要改 2 個以上既有資料夾的 gherkin。回第二步拆更細。真的拆不開就當新資料夾(B),
並在 FEATURE.md 依賴欄列出所有涉及的能力。

### A · 編輯既有資料夾

命中:完全落在某個 `FEATURE.md` 的「範圍」內,且不在「不在範圍」內。
測試:把這個能力加進該 FEATURE.md 的「一句話」後面,句子還通順嗎?
放哪個 phase:有 `todo`/`ready` 且內容相關的 phase → 加場景進去;相關 phase 已 `in-progress`/`done` → 新增 phase。
**新增 phase 時必須同時決定它的 gate**(自身／整合／契約),寫進 `NEXT.md`。

### B · 新資料夾

命中:不落在任何 FEATURE.md 的範圍;需要新的資料模型、新 UI 表面、新外部依賴;或明確落在某個
「不在範圍」且該段沒指向其他資料夾。
**新資料夾的 phase-1 必須能單獨跑**(`standalone.json` 一行)、只依賴 contracts 與自己。

## 第四步:輸出提案(不寫檔)

```
## 分流提案

需求:(重述)
目前階段:回填 / I2 / …

拆解為 N 個能力:

### 能力 1:(一句話)
判定:A 編輯既有 / B 新資料夾 / C 衝突 / D 跨能力 / E 動契約
理由:(引用哪個 FEATURE.md 的哪一段、或哪個 ADR、或契約的哪個 schema)
目標:features/NN-name/phase-N.feature(既有或新建)
建議整合點:I2 / I3 / … / 未排程
Gate:自身 …;整合 …;契約 …
單獨執行:(新資料夾時,這個能力怎麼單獨跑?寫得出來才是好的切法)
級別:嚴格 / 標準(理由)

草擬場景(標題,3–6 個,英文):
- Scenario: …
- @manual Scenario: …

---
確認後我會:
1. 寫入 / 修改上述 .feature(英文,每個場景 3–6 步,可執行)
2. 更新 FEATURE.md 的 phase 表
3. 更新 NEXT.md 的 gate
4. (新資料夾)從 features/_template 建立三個檔、更新 features/README.md 索引、standalone.json、docs/01-roadmap.md
5. (有取捨)/decide 寫 ADR
6. 回報變更清單

要調整哪裡?或說「確認」。
```

**停下來等回覆。**

## 第五步:確認後寫檔

1. 寫 gherkin,遵守 `features/README.md` 慣例。場景要完整可執行,不是只有標題。
2. 更新 FEATURE.md、NEXT.md(三類 gate + 「gate 未滿足時該做什麼」——這段最有價值)。
3. 新資料夾額外:索引、standalone.json、roadmap。
4. 有取捨就 `/decide`。
5. 回報所有新增與修改的檔案路徑。

## 禁止事項

- 不寫程式碼,只產生規格
- 不修改 `contracts/`、`archive/AI_KM_BMAD_High_Granularity/`
- 不修改 `done` 狀態 phase 的 `.feature`
- 未確認前不寫任何檔案
- 不把「不確定放哪」硬歸到某個資料夾——列兩個候選讓使用者選
- 不產生無法單獨執行的新資料夾
