# ADR 0016: `conversations.yaml` 的 `Message` 加選填 `citations[]`,以 marker 順序對應

Status: Accepted · 2026-09-05 ·
**授權鏈**:ADR 0013 把「契約放寬」從使用者級改為技術顧問級,其裁決表 **#10** 已明批
「`Message` 加**選填** `citations[]`(回應側新增選填欄位,對既有消費端相容),schema 對齊
`generation.yaml` 的 `Citation`」。本 ADR 是那條裁決的**落地**,不是重新開一次決策
——ADR 0013 批的是「可以做」,這份記的是「做成什麼形狀、量到什麼結果」。

## Context

`03-conversation/phase-2`(I2 第四塊)的交付是「送訊息 → RAG 回答 → 訊息帶 citations」。
`Message` 今天沒有這個欄位,而且是 `additionalProperties: false`
——**所以契約必須先放寬,實作才可能送得出 citations**,順序不能反(契約先於平行)。

`07-generation/phase-2` 已經讓 `app.rag.ask()` 產出帶引用的答案,`generation.yaml` 也早有
`Citation`。缺的只是「這個引用怎麼掛在一則訊息上」。

## Decision

### D1 — 欄位形狀:`$ref` `generation.yaml` 的 `Citation`,不重述

```yaml
citations:
  type: array
  items:
    $ref: "./generation.yaml#/components/schemas/Citation"
```

**referenced rather than restated**,理由是漂移:兩個地方各寫一次同樣的四個欄位,
遲早會有一邊改了另一邊沒改,而那種不一致**不會有任何東西報錯**
(§5.1 的「靜默給出錯誤結果」)。`$ref` 讓它在結構上不可能漂移。

### D2 — marker 用**陣列順序**對應,不加 `marker` 欄位

`citations[0]` 是 `content` 裡的 `[1]`,`citations[1]` 是 `[2]`,依此類推
——與 `citationFeedback` 的鍵(`"1"`、`"2"`)是同一套編號。

**考慮過加一個顯式的 `marker` 欄位並否決**:那會需要一個新的具名 schema
(`generation.yaml` 的 `Citation` 是 `additionalProperties: false`,不能就地加欄位),
而新具名 schema 會被 `pnpm contract-gate` 的 check 3 判為 UNBOUND,得再補一套綁定。
用順序對應不需要新 schema,而且 ADR 0013 #10 的原文就是「schema **對齊** generation.yaml 的
`Citation`」——照 `$ref` 走才是那句話的字面意思。

**這個選擇的代價要說清楚**:順序變成語意的一部分。任何重排 `citations` 的程式碼都會
靜默地改變它與 `content` 裡 `[N]` 的對應,而**沒有任何型別能擋住重排**。
所以 `03-conversation/phase-2` 必須有一個場景對著這件事斷言(引用的順序與 `[N]` 對得上),
不是只驗「有引用」。

### D3 — 缺席 ≠ 空陣列,寫進 description

- **缺席**:這則訊息不是 RAG 路徑產生的(I2 之前的舊訊息、使用者自己送的訊息)
- **`[]`**:走了 RAG 路徑,但那次回答宣稱沒有可引用的來源

兩者對 UI 是不同的東西(後者要顯示「找不到來源」,前者什麼都不該顯示)。
不寫清楚的話,消費端會把它們合併成 `citations?.length ?? 0`,而那正好抹掉這個區別。

## 量到的結果(§5.3:機制要用量的不要用讀的)

改完之後**實際跑**,不是推測:

| 檢查 | 結果 |
|---|---|
| `pnpm contract-gate` | **PASS**(zero DIVERGES;跨檔 `$ref` 沒有製造出新的 UNBOUND schema——`Citation` 在 `generation.yaml` 自己那邊已由 `generation-compat.ts` 的 `citationExact` 綁著) |
| `pnpm typecheck` | 45/45 |
| `pnpm accept:phase1` | 136/136 |
| `pnpm --filter @ai-km/api test` | 157/157 |
| `packages/api-client` 的 `check` | **一開始紅**——見下 |

**`api-client` 那條紅是這次最有價值的一個發現,記下來免得下一個人重踩**:
`packages/api-client/scripts/check.mjs` 的機制是「重新產生 `src/generated/*`,
然後與**已 commit 的版本** `git diff --exit-code`」。所以改契約之後:

1. 只跑 `pnpm --filter @ai-km/api-client generate` **不夠**——工作目錄改了但沒 commit,
   `check` 仍然紅(我實測踩到:generate 之後 check 給出一模一樣的 diff);
2. 生成檔**必須跟契約在同一個 commit 裡進版**,`check` 才會綠。

換句話說 `check` 守的不是「產生器跑過了」,而是「**版本庫裡的生成檔與契約一致**」
——這比前者強,而且它讓「改了契約卻忘記重新產生」變成 CI 紅,不是靜默漂移。

### 第二個量到的東西:D1 的跨檔 `$ref` 有一個具體代價,而且它的失敗方式會誤導人

改完之後 `apps/web` 的**全部 126 個測試檔一起紅**,而且是 `Tests: no tests`
——一個測試都沒跑到。根因不是斷言,是模組載入:

```
Error: [fake-api] could not resolve $ref "./generation.yaml#/components/schemas/Citation" from conversations.yaml
```

`apps/web/src/test/fake-api.ts` 的 `specDocs` 是一份**手工維護**的清單,列出
`dereference()` 允許跟過去的文件。`generation.yaml` 不在裡面,於是跨檔 `$ref` **不是降級,是拋錯**;
而 `compile()` 在 module scope 執行,所以它一次帶掉整個 package 的每一個測試檔。

**這個失敗方式的問題不是它太安靜,是它太吵而且長得不像原因**:
126 個檔案同時紅、`no tests`,看起來像環境壞了或依賴裝壞了,**完全不像「有人在契約裡加了一個欄位」**。
我自己也是先去找 import 錯誤才找到真正那一行。

修法是把 `generation.yaml` 加進那份清單,並在那裡留下註解說明**為什麼**
(不是「加了一個 doc」,而是「加跨檔 `$ref` 到新 doc 時,必須在**同一個 commit** 裡把那個 doc 加進來」)。

**這不推翻 D1**——`$ref` 防漂移的理由仍然成立,而且這個代價是一次性的、有明確修法的。
但它是選 `$ref` 而不是重述時**要一併付的錢**,寫在這裡,下一個加跨檔 `$ref` 的人不用再查一次。

## Consequences

**解鎖**:`03-conversation/phase-2`(I2 第四塊)的契約 gate 全滿足。

**要擋的**:

| 風險 | 擋法 |
|---|---|
| 順序被重排,`[N]` 與 `citations[N-1]` 悄悄對不上 | `03-conversation/phase-2` 必須有一個場景斷言順序對應,而且反向驗證要打在「把陣列反轉」上 |
| 消費端把「缺席」與 `[]` 合併 | description 寫明兩者不同;`11-app-shell/phase-2`(引用可點)要分別處理 |
| 契約改了但生成檔沒跟著進版 | `api-client` 的 `check` 已經是 CI gate,見上 |
| 之後有人再加一個跨檔 `$ref` 到**新的** doc,`apps/web` 全部測試在 module load 就掛掉,而症狀不像契約問題 | `fake-api.ts` 的 `specDocs` 旁邊已經留下註解說明這件事;規則是「加跨檔 `$ref` 到新 doc 時,同一個 commit 把那個 doc 加進 `specDocs`」 |

**這份 ADR 不授權**:在 `Message` 上加任何**其他**欄位;改 `generation.yaml` 的 `Citation`
(它現在被兩個 spec 共用,改它就是兩邊一起改);讓 `citations` 變成必填
(那是請求側/回應側都會破壞既有消費端的收緊,要重新走決策權表)。

## Related

ADR 0013 裁決表 #10(授權來源)、ADR 0014(I2 的固定 scope)、ADR 0015(store 共用)、
`features/03-conversation/NEXT.md` 的 phase-2 gate、`contracts/openapi/generation.yaml`。
