# ADR 0009: 檢索側跑本機小模型,生成側打外部 gateway

Status: **第一批(D2/D3/D4)Accepted 2026-09-04** — 使用者在協調者 session 直接批示「開始吧」。**第二批(D1)仍為 Proposed**,依使用者同日指示延後(gateway 尚未接上)。

> **授權紀錄(措辭刻意精確)。** 使用者原話「開始吧」,回應的是協調者上一則訊息中
> 「第一批(D2/D3/D4)—— 開工前只差你一句話」這句。因此本次授權涵蓋:
> **在 `services/model-gateway` 與 `services/retrieval` 的相關範圍內**實作 D2(bge-m3
> embedding provider)與 D3(cross-encoder 重排階段),以及 D4 的紀錄更正。
> `services/*` 屬 Team B 資料夾,依 CLAUDE.md 鐵律 #6 需使用者明示授權——本段即該授權。
>
> **不涵蓋**:D1(生成走外部 gateway)、R1 的 citation 子決策、任何 `contracts/*.yaml`
> 的變更(若實作中發現需要改契約,停下來問,鐵律 #1)。

> **2026-09-04 更新:拆成兩批,可以分開拍板。** 使用者表示 gateway 尚未接上
> (Cloudflare 還沒設),因此:
>
> - **第一批(D2 / D3 / D4)——不需要網路,可以先批。** embedding 與 rerank 都跑在
>   本機 GTX 1650 上,一個封包都不出去。生成側在此期間**維持現有的 canned
>   provider**,不會壞掉任何東西。
> - **第二批(D1)——延後,等 gateway 可達。** 這不是被否決,是被排到後面。
>
> **這個順序反而更好**:檢索品質是可以量的(Recall@5),而生成品質本來就建立在
> 檢索品質之上。先把檢索做對,生成接上去才有意義。
>
> ⚠️ **附帶更正一個可能的誤解**:D1 **不需要 Cloudflare**,也不需要公開網域。
> `AI_KM_GATEWAY_URL` 只是環境變數,填 `http://<內網 IP>:<port>` 與填
> `https://<網域>` 對程式完全一樣。同網段直接打內網位址即可;公開網域是「之後
> 要從外面存取」才需要的東西,與本 ADR 的技術決策無關。

> ADR 編號 0008 保留給 `paradigm/scaffold` 分支上的分階段 Gherkin 範式
> (使用者 2026-09-03 裁示該範式不併入 main,在自己的分支上長)。本 ADR 在
> main 上取 0009 以避免日後合併撞號。

## Context

`E04-S037`(RAG 開發前置環境就緒)在 2026-08-20 拍板了一組模型選型,理由寫在
`archive/stories/PROGRESS.md` 的該列裡:

> llama.cpp+GGUF(node-llama-cpp)、embedding(bge-m3 F16)+LLM(Qwen3-32B
> Q4_K_M 優先/14B 替代——**目標機器 VRAM 充裕,品質優先不省容量**)

### 那句前提不成立

`archive/stories/E12-S030.md` 的 L3 段落裡有實測輸出:

```
ggml_cuda_init: found 1 CUDA devices (Total VRAM: 3716 MiB):
  Device 0: NVIDIA GeForce GTX 1650, compute capability 7.5, VMM: yes, VRAM: 3716 MiB
```

開發機是 **GTX 1650,3716 MiB 可用**。第二台(4070)在 `E12-S030` 記為
`BLOCKED_DEPENDENCY`,至今未到位。

粗估(協調者的通用知識,非本 repo 量測,故標明):Qwen3-32B Q4_K_M 約 18–20 GB,
14B Q4_K_M 約 9 GB。**兩者都放不進 3716 MiB**,而 32B 連 12 GB 級的顯卡也放不下。

所以整組選型建立在一句已不成立的前提上。這與本 repo 這段期間反覆抓到的形狀相同:
**一份紀錄描述著一個已經不存在的狀態,而它與描述真實情況的紀錄長得一模一樣**
(對照 `E04-S081` 的過期契約散文、`E04-S084` 的自相矛盾豁免項)。

### 新的可能性:使用者的外部 gateway

使用者 2026-09-04 提供了一個自有的 LLM gateway 的呼叫方式。**網域 2026-09-04 補齊:
`siemensbuildingx.uk`**(使用者原話「對於我之前提供的外部 api,他的網域是 siemensbuildingx.uk」,
經技術顧問 session ai-km-3a 轉達)。網域與路徑一律進 `AI_KM_GATEWAY_URL` 環境變數,
**不寫死在碼裡**;`gx10_ak_<key>` 只進 `AI_KM_GATEWAY_API_KEY`,永不進 source / fixtures / log
(鐵律 §5.7),log 輸出必須遮蔽。端點:

- `POST /auth/token/exchange`(帶 `Authorization: Bearer gx10_ak_<key>`)→ 取得 `access_token`
- `GET /gateway/models` → 列出可用的**本地**模型(如 `qwen2.5:32b`、`deepseek-r1:70b`)
- `POST /gateway/chat` → `{prompt, model, service}` → `{content, provider, model, tokens_used, ...}`
- `POST /gateway/chat/stream` → 同上,SSE 事件流

使用者明示的限制:**`model` 只能填本地模型;填雲端付費模型或 `"auto"` 會被擋(403)**。
故本 ADR 的任何決策**不涉及金錢支出**。

這正好解除 `services/model-gateway/src/embedding/provider.ts` 註解裡自己寫下的阻塞:

> `WhisperServerProvider` could be written because whisper.cpp publishes the
> upstream API it speaks. No embedding runtime has been chosen for this
> deployment — that is **E04-S037**. Writing an `HttpEmbeddingProvider` now
> would mean **inventing the upstream request/response shape**, which
> ATOMIC_STORY_BOUNDARIES' AI Agent Rule forbids.

使用者提供的形狀解除了**生成側**的這個阻塞。**檢索側(embedding)仍未解除**
——該 gateway 目前沒有 embedding 端點。

## Decision

### D1 — 生成走外部 gateway,不在本機跑 LLM(**第二批,延後**)

新增 `HttpGenerationProvider`(`services/model-gateway/src/generation/`),透過上述
三個端點呼叫使用者的 gateway。`GenerationProviderName` 由 `"fake"` 擴充一個成員。

`AI_KM_GATEWAY_URL` / `AI_KM_GATEWAY_API_KEY` 一律走環境變數;**key 不得進
source / fixtures / log**(鐵律 §5.7),log 輸出必須遮蔽。

### D2 — Embedding 用 bge-m3,本機跑(**第一批**)

模型 `BAAI/bge-m3`,GGUF 取自 `smarttasks/bge-m3-GGUF`,**Q8_0(634.6 MB)**。
維度 1024(取代目前 `DEFAULT_EMBEDDING_DIMENSIONS = 256` 這個 deterministic
佔位值)。

**選它而不選 `Qwen/Qwen3-Embedding-0.6B` 的理由,依重要性排序:**

1. **bge-m3 是對稱編碼,沒有 instruction 前綴。** Qwen3-Embedding 是
   instruction-aware:查詢要加指令前綴、文件不加。做錯**不會有任何東西報錯**,
   只會排序變差、召回率下降,使用者看到「查無資料」。依本 repo 的判準,那是
   **「靜默給出錯誤結果」→ 嚴格級**。能選的時候少一個這種失效面,比帳面分數值錢。
2. **Qwen 的 32K context 在這個用途上是張用不到的牌。** 我們嵌入的是 PDF 切出來的
   chunk,通常數百 token,兩邊的上限(8K vs 32K)都碰不到。
3. **GGUF 現成。** `Qwen/Qwen3-Embedding-0.6B` 官方頁面只列 Safetensors,
   **沒有官方 GGUF**(2026-09-04 查證)。

**協調者的一項理由已撤回,記錄在此以免日後被當成仍然成立:**
最初推薦時列了第四條「bge-m3 同一次前向兼出 sparse 詞彙權重,對 error code、
料號等罕見 token 的精確匹配有用」。**`smarttasks/bge-m3-GGUF` 頁面明說該量化版本
只支援 dense**(*"These scores are for standard single-vector dense retrieval"*),
sparse / ColBERT 模式**未啟用**。走 llama.cpp 這條路拿不到那個能力,故撤回。
若日後需要混合檢索,替代方案是 **SQLite FTS5 / BM25 另建詞彙索引** —— 對識別碼
類查詢而言更簡單也更可解釋。

### D3 — 新增 cross-encoder 重排階段(**第一批**;這是新增的一段,不是取代 MMR)

模型 `BAAI/bge-reranker-v2-m3`,GGUF 取自 `Geofront/BGE-Reranker-v2-M3-GGUF`,
**Q8_0(636 MB)**,Apache-2.0。

目前 `services/retrieval/src/rerank/retrieve-with-reranking.ts` 的管線是:

```ts
const candidates = await service.retrieve(question, scope, poolSize);
return rerankMmr(candidates, topK, options);
```

`rerankMmr` 做的是**多樣性**(用已在手上的向量算冗餘,不呼叫模型),**它不改善
相關性**。排序本來就不準時,MMR 只是把不準的結果攤得比較均勻。

cross-encoder 把 (query, passage) **一起**送進模型直接輸出相關分數,補的是缺席的
相關性階段。目標管線是三段:

```
dense 召回(bge-m3,大候選池)
  → cross-encoder 重排(bge-reranker-v2-m3,相關性)
  → MMR(多樣性,取 topK)
```

### D4 — 更正 `E04-S037` 的紀錄(**第一批**)

該列的「目標機器 VRAM 充裕,品質優先不省容量」是**已被實測推翻的前提**,連同建立在
它上面的「Qwen3-32B Q4_K_M 優先 / 14B 替代」一併更正。更正方向是讓紀錄符合實測,
**不是**擴權或改變使用者的原始意圖(當時的意圖是「品質優先」,而在 3716 MiB 上,
本機跑 32B 根本不是一個可選項)。

**本機兩個模型 Q8_0 合計約 1.27 GB**,在 3716 MiB 上寬鬆。大模型完全不碰這台。

⚠️ **D1 延後時,D4 的更正仍然成立,但要寫得精確**:「32B 放不進 3716 MiB」是實測
推出的事實,與 D1 批不批無關。差別在於**取代方案**:D1 批了就是「走外部 gateway」,
D1 未批就是「**生成側維持 canned provider,真實 LLM 待定**」。紀錄要寫後者,
**不得**把一個還沒拍板的方案寫成既定計畫——那正是本 ADR 開頭在批評的那種紀錄。

## Consequences

### 變好的

- 生成品質不再被本機 VRAM 綁住(32B / 70B 跑在使用者自己的機器上)。
- 本機只需 ~1.27 GB 顯存,GTX 1650 足夠,4070 到位與否**不再是 RAG 的阻塞**
  (它仍是 `E12-S030` AC6 的阻塞,那是 ASR,兩件事分開)。
- `services/model-gateway` 既有的 provider 抽象**形狀對得上**,初判無需改契約
  ——`generation.yaml` 的 `GenerateResult { answer, citations, model }` 不變,
  只有 `GenerationProviderName` 這個型別要加成員。**此為初判,實作前須逐條核。**
- 分工合理:embedding 呼叫量大、模型小,放本機;LLM 呼叫量小、模型大,放遠端。

### 變難的 / 新增的風險

**R1 — citation 沒有現成來源(安全相關,最重要的一條)。**
`GenerateResult` 要求 `citations`,且 `assertCitationsGrounded()` 會擋:

```
生成結果引用了 N 個不在 context 內的 chunk(...)
```

註解直接寫著**引用未提供的 chunk 就是捏造來源**。但 `/gateway/chat` 回的是自由
文字,沒有結構化 citation。兩條路,各自的失效模式不同:

- **(a) 要求 LLM 以指定格式輸出 chunk id** —— 簡單,但 LLM 可能輸出不存在的 id
  (`assertCitationsGrounded` 擋得住)或格式跑掉(要有解析失敗的處理);
- **(b) 從回答文字反查提供的 context** —— 不依賴 LLM 守規矩,但可能標出 LLM 其實
  沒有引用的段落(**假引用,而且看起來很合理**)。

**本 ADR 不預先選定,列為實作前必須先決的子決策**,因為捏造來源是 RAG 最危險的
失效,而兩條路失敗的方式不一樣。

**R2 — 超長輸入的行為(2026-09-04 已量測,原本寫錯,更正如下)。**

~~原文:`max_length=512` 會靜默截斷,拿半段文字去評分。~~ **這是錯的。**

該說法來自模型卡上 Python `transformers` 範例裡的 `max_length=512` —— 在**那條**
路徑上截斷確實是靜默的。但本專案走的是 llama.cpp 的 server,行為不同。E04-S089 量
到、協調者複驗:

```
HTTP 500
{"error":{"code":500,"message":"input (2110 tokens) is too large to process.
 increase the physical batch size (current batch size: 512)","type":"server_error"}}
```

**它大聲失敗,不是靜默截斷。** 這是「讀出來的機制」又一次出錯——本 repo 已為此付過
兩次帳(flock 的 exit 66、共用的 turbo 快取),這是第三次,而且是寫在 ADR 裡散布出去的。

**真正的風險比原本寫的更精確**:**一份過長的文件會讓整個 `/rerank` 批次失敗**。所以
危險的不是「半段文字被評分」,而是**呼叫端在那時安靜地退回未重排的順序** —— 那才是
靜默的那一半。

E04-S089 的處置:provider 以 server 自己的 `/tokenize` + `/detokenize` **主動截斷**
(公式已對著真實 server 驗到 512 token 的邊界),並透過 `onTruncated` 回報。實測 chunk
token 分佈(真實 `chunkDocument()`,`targetSize=480`):n=13,min/max/mean =
38/324/135.3,最壞情況(密集無標點中文)403 token。今天離 512 還有餘裕,所以主動截斷
是守門而不是繞路。

**R3 — 兩份 GGUF 都是社群轉檔,且都沒有寫轉檔工具版本。**
轉壞了不會 crash,只會排序變差 —— 又一個靜默失效。採用前需要:

- **便宜的 gate**:一組明顯對錯的 (query, passage),若明顯相關的被排在明顯不相關
  的後面,轉檔就是壞的(抓得到嚴重損壞,抓不到輕微退化);
- **決定性的驗證**:同一批 pair 同時跑 GGUF 與 HF 原始模型,**比對分數**。

另:`smarttasks/bge-m3-GGUF` **頁面未標授權**(上游 bge-m3 為 MIT)。企業落地前
應補來源說明,或改用有標授權的轉檔。`Geofront/BGE-Reranker-v2-M3-GGUF` 標
Apache-2.0,與上游一致。

**R4 — llama.cpp 的 embedding / rerank 端點形狀尚未證實。**
兩個 GGUF 頁面都只寫了 `llama-server -hf ...`,**沒有寫端點與請求/回應形狀**。
依 `embedding/provider.ts` 自己訂的規則(「whisper 寫得出來是因為它公開了上游
API」),**必須先實際跑起來拿到真實回應,再寫 provider**,不得從文件推測形狀。

**R5 — 換 embedding 模型會使既有向量失效,但這是會出聲的。**
`E06-S026` 的 `EmbeddingIdentity { model, dimensions }` 讓 vector store 拒絕拿不同
函式產生的向量排序。維度由 256 → 1024 會被它擋住舊資料 —— **那正是它該做的事**,
代價是重新索引一次,不是隱性的品質衰退。

**R6 — 重排接縫已有一個已知的弱守門。**
先前查到 `retrieveWithReranking` 可以**完全不呼叫 `rerankMmr` 而 63 條測試全綠**。
在這條路徑上再插一段,若守門不變,**reranker 沒被呼叫也沒有人會知道**。本工作的
反向驗證必須紅在**順序或分數**上,不得是「有拿到結果」。

**R7 — 外部依賴(僅 D1,第二批)。** 生成側會依賴使用者那台機器可達。離線 / 斷網時
RAG 的答題不可用(檢索仍可用)。需要決定降級行為:回錯誤,還是退回 canned provider。
**D1 延後期間此風險不存在**,因為生成側就是 canned provider。

### 待補

**第一批(D2/D3/D4)開工前只差一項:**

- 使用者拍板。**沒有其他待補項** —— 兩個模型都有 GGUF、都放得進 1650、不需要網路。

**第二批(D1)待補:**

- ~~gateway 位址~~ —— **2026-09-04 補齊:`siemensbuildingx.uk`**(見上「新的可能性」段)。
  認證形狀(`POST /auth/token/exchange` + `Authorization: Bearer gx10_ak_<key>`)本來就已記錄,
  所以 D1 在「外部資訊」這一側**已經沒有待補項**。
- R1 的子決策(a 或 b)—— 這條**只在 D1 開工前需要**,因為 canned provider 已經
  自己產生 grounded citations,不受此影響。**依 ADR 0013,這條已不是使用者級**,
  由顧問／協調者在 D1 開工那一輪裁決並記 ADR。

**因此 D1 現在只卡在排程,不卡在資訊。** 它仍排在 I2 之後(檢索品質先於生成品質,見上「拆成兩批」段)。

**與批次無關的待決:**

- 4070 到位後是否把 embedding / rerank 也搬過去,或維持本機。

## 影響範圍

Team A / Team B 皆受影響。`services/model-gateway`(provider 實作)與
`services/retrieval`(重排管線)屬 Team B domain,依 CLAUDE.md 鐵律 #6 需使用者
明示授權後方可修改。本 ADR 為 `Proposed`,**在使用者拍板前不得開工**。
