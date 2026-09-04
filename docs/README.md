# docs/ — 讀法地圖

這份回答「現在要讀哪一份」,不是目錄的逐條翻譯。開工前的固定閱讀順序見根目錄 `CLAUDE.md`
的「強制工作流」段;這裡是**遇到具體問題時**該去哪一份的對照表。

## 何時讀哪份

| 情境 | 讀這份 |
|---|---|
| 剛接手,想知道現在整體在哪 | [`01-roadmap.md`](./01-roadmap.md)「現況」表 |
| 要做一個 phase | 該能力資料夾的 `FEATURE.md` + `NEXT.md` + 對應 `phase-N.feature`(見 [`../features/README.md`](../features/README.md)) |
| 「為什麼當初這樣設計」 | [`00-design.md`](./00-design.md)(凍結快照,不用每次讀) |
| 想知道某個決定現在生不生效、有沒有被推翻 | [`02-decision-map.md`](./02-decision-map.md) 的索引與「已知不同之處」 |
| 一個詞看不懂(scope、Deny-Wins、PF1、phase、owner…) | [`04-glossary.md`](./04-glossary.md) |
| 遇到一個「以前踩過的坑」該不該重踩 | [`PITFALLS.md`](./PITFALLS.md) |
| 有事需要使用者決定 | [`DECISIONS_NEEDED.md`](./DECISIONS_NEEDED.md) 加一列,不停下來等 |
| 要驗收一個整合點 | [`integration/README.md`](./integration/README.md) + 對應的 `iN-*.feature` |
| 契約或流程的最高權威 | [`policies/README.md`](./policies/README.md)(內容逐字複製自原始規格庫,這份是新範式讀法) |
| 找某個技術決策的完整脈絡(Context/Decision/Alternatives) | [`adr/README.md`](./adr/README.md),索引在 [`02-decision-map.md`](./02-decision-map.md) |
| 舊 story 的原始內容、找不到就查對照表 | [`../archive/stories/README.md`](../archive/stories/README.md)、[`../archive/stories/PROGRESS.md`](../archive/stories/PROGRESS.md)、對照表在 [`architecture/story-to-capability-map.md`](./architecture/story-to-capability-map.md) |
| 原始規格庫(BMAD)的完整文字 | [`../archive/AI_KM_BMAD_High_Granularity/readme_zh.md`](../archive/AI_KM_BMAD_High_Granularity/readme_zh.md)(tag `baseline-bmad`) |
| 這個封存了什麼、`baseline-bmad` 這個 tag 怎麼對回去 | [`../archive/README.md`](../archive/README.md) |

## 目錄

| 目錄/檔案 | 內容 | 狀態 |
|---|---|---|
| `00-design.md` | 產品定位、MVP 定義、v1 做/不做、核心體驗、角色、PD-01～40 唯讀索引、架構原則、monorepo 佈局 | 凍結快照,不改 |
| `01-roadmap.md` | 回填 12 個資料夾 + I1–I9 整合點現況,唯一進度來源 | 持續更新 |
| `02-decision-map.md` | ADR 索引、已知不同之處、PD→ADR 對照、依賴圖 | 持續更新 |
| `04-glossary.md` | 新範式詞彙表 | 持續更新 |
| `PITFALLS.md` | 尚未寫進規則檔、但值得記住的通則教訓 | 持續更新 |
| `DECISIONS_NEEDED.md` | 待使用者決定事項的唯一收件匣 | 持續更新 |
| `adr/` | 逐條 ADR,Context/Decision/Alternatives/Consequences/Related | 只增不刪 |
| `integration/` | 整合點的 Gherkin(`iN-*.feature`)+ 讀法說明 | 隨整合點推進 |
| `policies/` | 三份最高權威 policy,逐字複製 + 新範式讀法 | 凍結(改它 = 改最高權威,只有使用者能做) |
| `architecture/` | 技術決策的支撐分析,見該目錄 `README.md` | 持續更新 |
| `design/` | M3 視覺設計稿(app shell、home、pages、品牌素材、語音視覺化) | 持續更新 |
| `runbooks/` | 部署、設定、mock 觸發、安全標頭等操作手冊 | 持續更新 |

`api/`、`product/`、`security/` 三個目錄在 2026-09-04 因為只有樣板 README、從未被任何活文件
引用而刪除(內容見 git 歷史);真的有這類文件時,直接在 `docs/` 下新開對應資料夾,不用先建空殼。

## 與 `archive/` 的關係

`docs/` 是**現在生效**的文件;`archive/` 是**凍結歷史**,只在需要查原始脈絡或某個舊 story
的細節時才進去讀,不是任何工作的規格來源。兩者的橋接見 [`../archive/README.md`](../archive/README.md)。
