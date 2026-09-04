# ADR 0017: `createMessage` 的 TRANSITIONAL 段現在是**錯的**,分兩步修

Status: Accepted · 2026-09-05 ·
**裁決人:技術顧問 ai-km-1b**(決策權表:契約請求側收緊 → 顧問;本 ADR 的第一步是純文件、
第二步是請求側收緊,顧問已在同一則裁決裡預先批准並附條件)。
**發現者**:`03-conversation/phase-2` 的開發 agent,在實作完成後主動回報,不是審核時抓到的。

## Context

`contracts/openapi/conversations.yaml` 的 `createMessage` 操作描述現在寫著:

> TRANSITIONAL: `role: assistant` is accepted because **generation still runs in the browser**
> (E03-S010). When real server-side generation lands in E04, assistant messages will be produced
> by the server and **this request will be rejected** — that removal is a BREAKING CHANGE and
> needs a version bump plus consumer migration.

`CreateMessageRequest.role` 的欄位描述也有一句對應的
「`assistant` is accepted **only while generation still runs in the browser**」。

**這兩句現在是假的,不只是過期**——差別重要:

- **過期**是「描述的是舊狀態,但沒說錯什麼」;
- **錯**是「它斷言的事實現在不成立」。

`03-conversation/phase-2`(2026-09-05)落地之後,**伺服器端生成是真的、而且正在跑**
(`apps/api` 的 `app.rag.ask()` → 訊息路由自動產生助理回覆)。所以「generation still runs in
the browser」**是假的**。

而它承諾的後果(「this request will be rejected」)**刻意沒有實作**:今天**兩條路同時活著**
——伺服器會自動產生助理回覆,**而且**客戶端仍然可以自己 POST 一則 `role: assistant`,照樣 201。

開發 agent 沒有自己去改契約(它不該改),把這件事回報上來。這份 ADR 是那個回報的落地。

## Decision

### 第一步(本輪,`03-conversation/phase-2` 收尾時做):只改描述,**零行為變更**

把 TRANSITIONAL 段改成**帶日期的過渡註記**,措辭由顧問給定:

> 2026-09-05 起 server 端生成已存在(`app.rag.ask`);瀏覽器端生成(E03-S010)與 client 送
> `role: assistant` **仍被接受**,直到 I2 `/integrate` 的「stub 已移除」那一項。

`CreateMessageRequest.role` 的欄位描述同步對齊。

**這一步是回應側文件變更,零行為變更**,依決策權表由顧問批,已批。

**為什麼不能「先留著錯的,等第二步一起改」**:一句斷言事實而該事實不成立的契約描述,
比沒有描述更糟——它會讓讀契約的人(以及據此寫消費端的人)相信一件假的事,
而且**沒有任何機械守門會抓到散文說謊**(`contract-gate` 檢查的是 schema 與路由的結構,
不是描述的真假)。這正是 PITFALLS 坑 8 的家族:**紀錄與現實脫節,而紀錄看起來一樣可信。**

### 第二步(web 切到 server 生成、移除瀏覽器生成的那個 phase):請求側收緊

顧問**現在就裁決:准**,條件是:

- **消費者只有 `apps/web`**,且
- **同一個 PR 完成遷移**

那個 PR 要一次做完四件:

1. `apps/web` 切到 server 生成,移除瀏覽器端生成(E03-S010)
2. 開始**拒絕** client 送 `role: assistant`(400 `VALIDATION_ERROR`)
3. 重寫 `createMessage` 與 `CreateMessageRequest.role` 的描述(過渡註記整段拿掉)
4. 依契約自己寫的規則**升版**

**落點由協調者排**(`11-app-shell/phase-2` 或 `03-conversation/phase-3`),本 ADR 不指定。

### I2 `/integrate` 的「stub 已移除」查的就是這兩件

`/integrate` 的檢查清單裡「stub 已移除」這一項,對 I2 的具體內容就是:
**瀏覽器端生成已移除**、**client 送 `role: assistant` 已被拒絕**。
寫在這裡,免得驗收時要靠記憶。

## Consequences

| 風險 | 擋法 |
|---|---|
| 第一步做完就忘了第二步,過渡註記變成永久狀態 | 過渡註記**自己寫明終點**(「直到 I2 `/integrate` 的『stub 已移除』那一項」),而那一項是 `/integrate` 的必查項 |
| 第二步做了但沒升版 | 契約自己就寫著「that removal is a BREAKING CHANGE and needs a version bump plus consumer migration」,第二步的四件事第 4 項照抄 |
| 有第二個消費者出現,顧問的條件失效 | 條件是「消費者只有 `apps/web`」。第二步開工前要重新確認這句仍成立;不成立就回來重裁 |

**這份 ADR 不授權**:第二步的任何一部分提前單獨落地(四件事必須同一個 PR,否則會出現
「拒絕了 client 但 web 還在送」的空窗);改 `Message` schema 的任何欄位(那是 ADR 0016)。

## Related

ADR 0013(契約放寬／請求側收緊改為顧問級)、ADR 0016(`Message.citations[]`)、
`docs/01-roadmap.md` 的 I2 段、`features/03-conversation/` 的 phase 表。
