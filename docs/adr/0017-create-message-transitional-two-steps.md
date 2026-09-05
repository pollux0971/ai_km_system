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

> **2026-09-05 顧問確認並加碼**:`@e2e` 通過之後 `/integrate I2` 收尾時,
> 「stub 已移除」這一項**照本 ADR 第二步查**——瀏覽器端生成與 client 送 `role: assistant`
> **兩條路是否都已移除**;**沒移除就 I2 不收,不做例外**。
>
> **後果要說清楚,免得有人以為 `@e2e` 過了 I2 就結束**:第二步的落點原本寫
> 「`11-app-shell/phase-2` 或 `03-conversation/phase-3`,由協調者排」。
> `11-app-shell/phase-2` 已於 2026-09-05 完成,而**它沒有做第二步**
> (它的範圍是引用可點與 `state` 缺席的中性渲染)。所以第二步**還需要一個 phase**,
> 而 I2 在那個 phase 落地前不會被收掉。
>
> (顧問的訊息把這條寫成「ADR 0018 (a) 的裁決」——**編號是筆誤,實際是本 ADR(0017)的第二步**。
> ADR 0018 是助理訊息的 `state`。在這裡更正,因為 `/integrate` 收尾時要照著查的就是這一段。)

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

## 追加段(2026-09-05,技術顧問 ai-km-1b 裁決):第二步**同時移除** `CreateMessageRequest.state`

第二步把 `CreateMessageRequest.role` 的 enum 收成 `[user]` 之後,
`services/conversation/src/routes/messages.ts:233` 的
`if (body.role === "user" && body.state !== undefined) → 400` 會讓
`conversations.yaml:1097` 的選填 `state` **永遠不合法**——契約留著一個**任何合法請求都不能帶**
的欄位。

**裁決:移除它,與 `role` 的收緊在同一次升版。** 顧問原話:

> 「state 裁:**(b)**,從 CreateMessageRequest 移除,與 role enum 收緊同一次升版——它們是同一個
> breaking change 的兩半,ADR 0017 第二步 (d) 已涵蓋。**留一個任何合法請求都不能帶的選填欄位是
> 契約說謊。**」

**為什麼要在這裡追加而不是默默做**:刪欄位是顧問級,而本 ADR 的 Consequences 段寫著
「本 ADR 不授權……改 `Message` schema 的任何欄位」。那句指的是 ADR 0016 的 **`Message`**,
不是 `CreateMessageRequest`——但界線近到不該自己跨,所以留痕。

**機制照第二步的同一條路線**:`CreateMessageRequest` 已經是 `additionalProperties: false`
(`conversations.yaml:1076`),所以移除 `state` 之後,client 再帶它就由 **schema 驗證**回
400 `VALIDATION_ERROR`,**不寫 `if`**。理由與 enum 收緊相同:handler 裡的 `if` 消失時沒有
守門會紅,schema 有 `contract-gate` 與 L2-EQ 守著。

`03-conversation/phase-4` 因此多一條場景:**client 帶 `state` → 400,而且失敗訊息指名
`state`**。它驗的是移除本身,不是移除的替代品。

**發現路徑值得記**:這條是協調者派紅規格時當成「待回報的欄位處置問題」丟給測試 agent 的,
顧問一開始對著 `grep -A22` 的視窗(停在 1091,`state` 在 1097)回「契約裡沒有 state」,
協調者把整段逐行貼回去才更正。顧問自己的結論:**§5.3 量的時候要確定量到的是整個東西。**
同一則訊息裡的另一半也撤回了——`messages.ts:67` 那份本地 schema 是
`CREATE_REVISION_BODY_SCHEMA`(revisions 路由),POST messages 用的是契約 schema,
**路由沒有比契約鬆,不是缺陷**。

## 追加段(2026-09-05,技術顧問裁決):改契約的 phase 負責**全 repo**所有消費者的機械後果

第二步落地時,同一個根因在**四個不相干的地方**同時轉紅:

| 紅在哪 | 什麼 |
|---|---|
| `apps/web` 的 6 條 `*.test.tsx` | `MessageCitation` 少了 `07-generation/phase-2b` 新加的必填 `text` |
| `apps/web` 的 Next build | `receiveAssistantReply` 還在,型別假設 client 能送 `role: assistant` |
| `tools/contract-equivalence` 的 live fixture | 手造的 body 帶 `role: "assistant"` |
| `09-feedback-analytics/phase-1.feature` 的 6 個場景 | 前置資料用 POST 一則 client 助理訊息 |

**通則**:**改契約的那個 phase,負責全 repo 所有消費者的機械後果,由它自己的測試 agent 做,
commit body 逐檔列出。** 不把它推給「下一個踩到的人」——那正是本輪四個地方各自轉紅、
而每一個發現者都以為是別人的問題的原因。

**本輪的指派**:
- `apps/web` 那 6 條 fixture → **`07-generation/phase-2b`** 的測試 agent(是它加的 `text`);
- `tools/contract-equivalence` 的 live fixture 與 `09-feedback-analytics/phase-1` 的前置資料
  → **`03-conversation/phase-4`** 的測試 agent(是它收的 enum)。

**`tools/contract-equivalence` 不屬於任何能力資料夾**(共用工具)。顧問裁:
**這次由 `03-conversation/phase-4` 的測試 agent 改,協調者在 merge body 簽名,不另開 `chore`。**

**統一修法形狀**(由 `03-conversation/phase-4` 的開發 agent 提出):所有 fixture 把
「POST 一則 client 助理訊息」換成 **repository 層的 `createMessage()` 直接寫入**
——它們本來就是在**準備前置資料**,不是在測「client 能不能送」這件事本身,
所以不該經過那條正在被收緊的請求路徑。`triggerRagReply` 已經示範過。

**第二步的第 1 件有兩層,原文只寫了一層**:「**停止呼叫**」與「**移除**」。
`11-app-shell/phase-3` 做了前者,後者掉在兩個 phase 中間,由新開的
**`11-app-shell/phase-3b`** 補,並成為 `03-conversation/phase-4` 的新 gate。

## Related

ADR 0013(契約放寬／請求側收緊改為顧問級)、ADR 0016(`Message.citations[]`)、
`docs/01-roadmap.md` 的 I2 段、`features/03-conversation/` 的 phase 表。
