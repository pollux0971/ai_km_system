# ADR 0018: 助理訊息的 `state` 由 generation 的**結構化結果**決定,不用啟發式;I2 期間**不設**

Status: Accepted · 2026-09-05 ·
**裁決人:技術顧問 ai-km-1b**(產品行為未定義 → 顧問,ADR 0013)。
**⚠️ 本 ADR 的「Decision 2(I2 期間不設)」是協調者對顧問裁決形狀的一處差異,
依顧問定的協定(「你把 ADR 寫成這樣送來,我只看差異」)送審中。**

## Context

`03-conversation/phase-2` 讓伺服器自動產生助理訊息。`Message.state`(`AnswerState`)這個欄位
要填什麼,**從來沒有人規定過**——開發 agent 自己回報了這件事,而它當時的做法是啟發式:

```
citations.length > 0 → ANSWERED,否則 → NO_EVIDENCE
```

顧問的裁決一句話:

> **不准用「有引用 → `ANSWERED`」啟發式,那是把結果的副作用當成結果。**

這句話值得展開,因為它是本 ADR 唯一的理由:引用的**有無**是回答過程的**副作用**,
不是回答的**結論**。一個模型可以在有來源的情況下仍然答不出來(該是 `NO_EVIDENCE` 或
`PARTIAL`),也可以在來源被授權過濾掉之後產生一段看似完整的話。用副作用回推結論,
在**多數情況下會猜對**——而那正是它危險的地方:它會長期看起來正確,直到某天不正確,
而那一天沒有任何東西會報錯(§5.1 的「靜默給出錯誤結果」,也是這個資料夾被分成嚴格級的理由)。

## Decision 1 — 最終形狀(顧問裁定,逐條照抄)

`state` 必須由 generation 的**結構化結果**決定:

| 情況 | `state` |
|---|---|
| answer 帶 ≥1 citation | `ANSWERED` |
| **結構化棄答**(無授權來源) | `NO_EVIDENCE` |
| provider 錯誤 | `ERROR` |
| **檢索因授權被縮到空** | `NO_EVIDENCE`,**不得**發 `PERMISSION_DENIED` |
| `PARTIAL`、`SOURCE_UNAVAILABLE` | I2 **不產生**;本 ADR 明記「未定義,不使用」 |

**「授權被縮到空 → `NO_EVIDENCE` 而不是 `PERMISSION_DENIED`」這條是安全要求,不是風格選擇**:
`PERMISSION_DENIED` 會告訴使用者「**有東西存在但你不能看**」,而那本身就是未授權資訊的洩漏
——違反鐵律 2「未授權資料不進 context/citation/export/log」的精神。使用者該看到的與
「這個問題沒有可引用的來源」**無法區分**,那是 fail-closed 的正確形狀。

**分級**:嚴格級(靜默給出錯誤結果)。反向驗證對著 **`state` 的值**:
把棄答改成 `ANSWERED`,場景必須紅**並印出實際 `state`**。

## Decision 2 — I2 期間**不設** `state`(這是與顧問裁決形狀的差異,送審中)

Decision 1 做不出來,因為 **`07-generation` 今天沒有結構化棄答訊號**。
`answer()` 回的是 `{ answer, citations }`,沒有任何欄位能區分
「有來源但答不出來」與「根本沒有授權來源」——ADR 0013 #12 已裁定要有結構化棄答
(`abstained` + `abstentionReason` enum),但**還沒落地**,那是 `07-generation/phase-3`。

顧問的裁決說「如果 07 的 `answer()` 現在沒有結構化棄答訊號,那是 07 的缺口,
**先補訊號再接 `state`**」。協調者的差異在**順序與範圍**:

**補訊號是 `07-generation/phase-3` 的交付,不是 `03-conversation/phase-2` 的。**
在 03 這個 phase 裡跨進 07 的資料夾補訊號,違反 GHERKIN_WORKFLOW §4
(「一個需求橫跨 3 個以上資料夾 → 停,`/feature` 拆」的同一個精神)與鐵律 6 的範圍紀律。

所以本輪的做法是:**自動產生的助理訊息完全不設 `state`。**
`Message.state` 在契約裡是選填(`required` 只有
`id`/`conversationId`/`role`/`content`/`attachmentNames`/`createdAt`),不設是合法的。

**理由,而且這是本 ADR 最想留給後人的一句**:

> 一個**沒設**的 `state` 是誠實的「不知道」;一個**猜對**的 `state` 會讓下一個人以為那裡有根據。
> 這兩者在測試上看起來一樣,在後人讀碼時完全不同。

不設 `state` 會讓 UI 少一個訊號——那是**真實的成本**,不假裝沒有。但它是**可見的**缺席
(UI 拿不到值,會知道自己不知道),而啟發式是**不可見的**錯誤(UI 拿到一個值,不知道它是猜的)。

## Decision 2 已核准(2026-09-05,技術顧問 ai-km-1b),附三個條件

顧問裁決原文的要點:「**不設比啟發式誠實,跨資料夾補訊號違反範圍紀律,你的理由成立**」。
**准**,但附三個條件——這三條不是補充說明,是這個「暫時不設」不會變成永久的擋法:

1. **`07-generation/phase-3`(結構化棄答)與 `03-conversation/phase-3`(依訊號設 `state`)
   排在 I2 之後、I3 之前,不可延到 I3 之後。**
   理由是顧問給的,而且是這三條裡最重要的一條:**I3 是授權開始真的縮 scope 的時點**,
   到那時「沒引用、沒 `state`」的助理訊息**對使用者就是靜默錯誤結果**
   ——他問了一個他無權看到來源的問題,畫面上看起來就像「系統答不出來」,
   而那兩件事在使用者眼裡必須分得開。**I2 期間不設 `state` 是安全的,I3 之後就不是了。**
2. **`11-app-shell/phase-2` 的 UI 對 `state` 缺席必須渲染為中性(無徽章),不得當 `ANSWERED`。**
   這條**要進 `11-app-shell/phase-2` 的 `.feature` 一個場景**,不是寫在註解裡
   ——否則「不設 `state`」在後端是誠實的,到了前端又被猜回來,等於什麼都沒擋。
3. **Decision 1 的映射保留顧問裁的版本**(授權縮空 → `NO_EVIDENCE`,**不發**
   `PERMISSION_DENIED`),phase-3 直接照做,不重新討論。

## 落地順序

| 步驟 | 落點 | 內容 |
|---|---|---|
| 1 | `03-conversation/phase-2`(本輪) | 拿掉啟發式,**不設** `state` |
| 2 | `07-generation/phase-3` | 結構化棄答訊號落地(ADR 0013 #12 已裁,不是新決策) |
| 3 | `03-conversation/phase-3` | 依 Decision 1 的對應表接上 `state`;嚴格級,反向驗證對著 `state` 的值 |

第 2、3 步要寫進各自的 `NEXT.md` DoD,不是備忘。

## Consequences

| 風險 | 擋法 |
|---|---|
| 「暫時不設」變成永久不設 | 步驟 2、3 寫進 `07`/`03` 的 `NEXT.md` DoD;本 ADR 是它們的出處 |
| 有人日後補上啟發式(「反正多數時候是對的」) | Decision 1 的表 + 本 ADR 的理由段;`03-conversation/phase-3` 的反向驗證要對著 `state` 的值 |
| 授權過濾洩漏成 `PERMISSION_DENIED` | Decision 1 明文禁止,並寫明理由是鐵律 2 |

## Related

ADR 0013 #12(結構化棄答)、ADR 0016(`citations[]`)、GHERKIN_WORKFLOW §5.1(靜默錯誤結果)、
CLAUDE.md 鐵律 2、`features/07-generation/NEXT.md` phase-3、`features/03-conversation/NEXT.md`。
