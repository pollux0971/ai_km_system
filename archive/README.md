# archive/

## AI_KM_BMAD_High_Granularity/(2026-09-04 封存,ADR 0008)

原始規格庫(BMAD 產出,93,401 行,14 個 epic、300+ 條 story 模板)。**已被分階段 Gherkin 取代**,
自封存日起只當背景,不再是任何工作的規格來源:

- 真正有內容的部分已蒸餾到 `docs/00-design.md`(產品定位、MVP=薄切片、40 條暫定產品決策、
  角色、核心體驗、架構原則)與 `docs/policies/`(三份 policies 逐字複製,仍是最高權威)。
- 各 epic 的 story 內文大量為共用模板(E04 46 條只有 12 種內文、E06 40 條只有 2 種、E12 31 條
  只有 5 種),不蒸餾;有內容的個別 story 由各能力資料夾 `FEATURE.md` 的「來源」欄按需引用,
  引用路徑用本目錄。
- `SOURCE_BASELINE.md` 在 §25 中途截斷(§26–45 不存在,含 §35 RAG Evaluation Policy、§43 MVP 驗收指標);
  那些主題若需要,走 `/feature` 或 `/decide` 從零定義,不要假設它們「原本有寫」。

歷史引用(`docs/stories/`、`ROADMAP_TEMP.md`)仍指向舊路徑 `AI_KM_BMAD_High_Granularity/`,那些檔案是
凍結歷史,不改;讀到時自行對應到本目錄。
