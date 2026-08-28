# 待使用者批示的決策(Pending Decisions)

`/advisor` 在自主模式下遇到「必須由使用者決定」的問題時寫入此檔;
使用者批示後,把該項移到下方「已批示」區並註明結論,對應 story 才能解除
`blocked`。

## 待批示

### [2026-08-15] E05-S024 — Document version history 該現在做成純前端 mock,還是等 E06-S030(Team B)?

**背景**:

E05-S024「Document version history」在 epic 檔中只有通用樣板文字
(已用 `diff` 逐字比對 S023/S024 兩節內文確認,除故事名稱代換外
完全相同,無任何 story 專屬內容)。同時找到
`AI_KM_BMAD_High_Granularity/epics/E06_Knowledge_Ingestion_&_Indexing.md`
有三個明確對應的 Team B story:E06-S030「Document version
creation」、E06-S031「Active-version switch」、E06-S032
「Archive-version flow」,三者皆為 `todo`(尚未開工)。
`apps/web/src/lib/knowledge-documents.ts` 自 S010 起的既有 doc
comment 就已經寫明:「No... `version` field ... E06-S30-32
(document versioning, Team B) are each their own separate later
story」——這個 Team A/B 分工邊界並非我現在才發現,是這個 codebase
自己一路以來就已經標記的既有認知。

**卡住的原因**:Team A(本 repo)目前完全沒有任何機制能讓一份文件
的「內容」在建立之後產生第二個真實版本——上傳(S011-S015)永遠是
建立一份全新的文件,不是替既有文件追加版本;S023 的重新命名只改
`name` 欄位,不觸及內容,不構成內容版本的定義。這與先前處理過的
「Team B worker/enforcement 不存在」情境(S016 資料夾同步、S006
權限設定)有本質差異:那兩個 story 即使背後的真實執行機制
(worker/enforcement)不存在,Team A 自己仍然握有**真實、誠實、
使用者親自提供**的設定資料可以誠實顯示與測試(「is a setting
only」測試證明沒有假造任何 enforcement,但設定本身是真的)。本
story 沒有這種「Team A 自己真實擁有的資料」可以類比——一份文件
從建立到現在,系統中(不管 mock 與否)從未有任何動作讓它出現過
第二個內容版本。

**做錯的代價**:若現在動工,能誠實呈現的內容只剩三種,皆判定不
可接受:(1)捏造假的版本紀錄——直接違反本 story 鏈自 S011 起
一路堅持的「不假裝擁有不存在的資料」原則;(2)蓋一個結構上永遠
是空的 UI 殼——沒有任何操作能讓它顯示出「尚無版本紀錄」以外的
內容,本質上不是一個真正可運作的功能,可能誤導使用者以為這是
一個有效但剛好沒資料的功能,而非一個結構性缺陷;(3)偷換範圍成
「重新命名紀錄」之類的中繼資料異動日誌——雖然誠實(S023 的重新
命名是真實事件),但「version history」在任何合理讀法下指的都是
內容版本,不是中繼資料異動,把兩者混為一談形同用不同的功能冒充
本 story 要求的功能,有「宣告完成」造假之虞。

**選項**:

1. (推薦)**標記 `blocked-team-b`,等待 E06-S030 提供真實的
   版本建立 contract/機制後再動工**——理由見上述「做錯的代價」;
   一旦 E06-S030 存在(即使只是 Team B 提供的 mock-but-contractual
   服務),E05-S024 就有真實資料可以誠實顯示,屆時可以正常走完整
   STORY_WORKFLOW。
2. 動工做「永遠空清單」的 UI 殼,附帶清楚的「尚無版本紀錄」空狀態
   ——技術上不算捏造資料,但功能本身沒有任何使用者能觸發的路徑
   讓它顯示別的內容,審核時很可能被判定為「名為完成、實為空殼」。
3. 重新定義範圍為「文件異動紀錄」(重新命名、重試處理等 Team A
   既有動作的時間軸),明確標註這不是內容版本——誠實,但等同於
   把 story 換成另一個不同的功能,且需要另外確認這樣的範圍替換
   是否仍算完成了 E05-S024 原本要求的東西。

**影響範圍**:只影響 E05-S024 這一個 story 何時開工;不影響
`/keep-working-till-end` 迴圈其餘 story 的選取順序(迴圈會跳過
`blocked-team-b` 的 story,繼續下一個)。若使用者選擇選項 2 或 3,
需要回來這裡批示後才會回頭處理這個 story;若使用者之後拿到 Team B
的 E06-S030 contract,也需要回來解除 `blocked-team-b`。

### [2026-08-28] E01-S021／E01-S022／E03-S042 — M3 視覺假設(不阻塞開工,可事後推翻)

> **[2026-08-28 使用者批示]** 第 1 點(種子色)已拍板:**沿用 `#1e56a0`**,不再視為
> ASSUMPTION,E01-S021 依此實作。第 2～6 點使用者未逐點回覆,維持 ASSUMPTION
> 狀態(仍可事後推翻,推翻成本隨 M3 story 完成數上升)。

**背景**:使用者 2026-08-28 拍板 ASR／持久化／同步的技術方向,但未回覆
M3 視覺細節。為讓 story 可直接開工,以下以 ASSUMPTION 寫入規格,推翻時只
需改 seed／字型檔／圖示風格,不影響其他 story:

1. ~~種子色沿用既有品牌藍 `#1e56a0`(E01-S021 `generate-m3-theme` 的 seed);
   若有正式品牌色請提供 hex。~~ → **已由使用者於 2026-08-28 確認沿用 `#1e56a0`**。
2. 圖示使用 Material Symbols **Outlined**(可改 Rounded/Sharp,只換字型檔)。
3. 字型:Roboto(拉丁)+ Noto Sans TC(中文)自託管,約 10–12 MB woff2 進 git。
4. 動畫素材一律原創純 SVG/CSS,不用 Lottie。
5. 深色模式沿用 `prefers-color-scheme`,不做手動切換。
6. M3 範圍先做 apps/web(shell、首頁、對話頁優先;其餘頁為 P2),apps/admin
   不在本批。

**選項**:(推薦)全部照上述假設;或逐點回覆要改的項目。

**影響範圍**:只影響 E01-S021/S022/S023/S024/S025、E03-S042/S043 的視覺
輸出;不影響後端與資料層 story。

<!-- 模板:
### [YYYY-MM-DD] EXX-SYYY — 一句話問題
- 背景:
- 選項:
  1. (推薦)… — 理由
  2. … — 理由
- 影響範圍:
-->

## 已批示

(目前無)
