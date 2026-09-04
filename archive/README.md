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

**凍結引用對回哪裡**:本目錄下所有仍寫著舊路徑 `AI_KM_BMAD_High_Granularity/`(不是 `archive/` 前綴)的
文字,一律對回 tag **`baseline-bmad`**(`git show baseline-bmad:AI_KM_BMAD_High_Granularity/...`)——那個
tag 釘住 rename 之前、規格庫還在原始路徑下的最後一個 commit。這些文字是凍結歷史,不改。

## stories/(2026-09-04 封存,原路徑 `docs/stories/`)

舊 epic-story 狀態機的全部證據:272 個 story 的 EVIDENCE(`EXX-SYYY.md`)、`specs/`、`PROGRESS.md`
(進度唯一真相,舊範式)、`PENDING_DECISIONS.md`。**自 2026-09-03 起凍結為唯讀歷史**(見
`.claude/rules/STORY_WORKFLOW.md` 開頭的棄用說明),`/phase-done`、`/integrate` 不讀它,新待決事項一律
進 `docs/DECISIONS_NEEDED.md`。目錄內部的相對連結(`specs/EXX-SYYY.spec.md` 等)搬移時保持相對關係,
未改寫。

對照表 `docs/architecture/story-to-capability-map.md` 把這 272 個 story 分派到 12 個能力資料夾,是讀
這批歷史時的入口——它記錄「這個 story 的內容後來變成哪個資料夾的 phase-1 素材」,不是逐條重新驗收。

## ROADMAP_TEMP.md(2026-09-04 封存)

舊範式的排程輔助檔(1447 行,產生於 2026-08-28,依 `docs/stories/PROGRESS.md` 逐日追加)。**凍結歷史,
不改**——內文仍寫著舊路徑 `docs/stories/`,讀到時對應到本目錄的 `stories/`。其中仍有實用價值的段落
(CI 單一 job 掩蓋紅燈訊息量、契約等價檢查首次執行的發現、Wave 1 收尾回顧的三題)已蒸餾成通則寫進
`docs/PITFALLS.md`,不必回來讀完整的第一手調查過程,除非要查某個具體 story 的原始時間戳與 `gh` 查證。
