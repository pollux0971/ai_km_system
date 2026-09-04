# 重排模型:bge-reranker-v2-m3(GGUF,cross-encoder)

ADR 0009 D3。**權重不進 git**(`.gitignore` 的 `models/rerank/**`);這份 README 進。

## 這台機器上實際存在的檔案

| | |
|---|---|
| 檔名 | `BGE-Reranker-v2-M3-Q8_0.gguf` |
| 來源 | Hugging Face `Geofront/BGE-Reranker-v2-M3-GGUF` |
| 上游模型 | `BAAI/bge-reranker-v2-m3`(建於 `bge-m3` 之上) |
| 授權 | Apache-2.0(與上游一致) |
| sha256 | `cd76b6a35685b66f53fca358e2c33d48200b93ed74123d478136e9d01cf3c623` |
| bytes | `635673472`(頁面標示 636 MB) |
| 取得日期 | 2026-09-04 |

## 取得方式

```bash
hf download Geofront/BGE-Reranker-v2-M3-GGUF --include '*Q8_0*' --local-dir models/rerank
sha256sum models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf   # 必須等於上表
```

## 它做的事,以及它**不是**在取代什麼

這是 **cross-encoder**:把 (query, passage) **一起**送進模型,直接輸出相關分數
(上游原話:*"uses question and document as input and directly output similarity
instead of embedding"*),原始分數可用 sigmoid 映到 [0,1]。

它補的是 `services/retrieval` 目前**缺席的相關性階段**,不是取代 `rerankMmr`。
`rerankMmr` 做的是**多樣性**——它用已經在手上的向量算冗餘,不呼叫任何模型,
**不會改善相關性**。排序本來就不準時,MMR 只是把不準的結果攤得比較均勻。

目標管線是三段:

```
dense 召回(bge-m3,大候選池)
  → cross-encoder 重排(本模型,相關性)
  → MMR(多樣性,取 topK)
```

## ⚠️ 超長輸入:大聲失敗,不是靜默截斷(2026-09-04 更正)

~~本節原本寫「超過 512 就靜默截斷,拿半段文字去評分」。~~ **那是錯的**,來自模型卡
上 Python `transformers` 範例的 `max_length=512`——那條路徑截斷確實是靜默的,但走
llama.cpp 的 server 不是。實測(E04-S089 量到,協調者複驗):

```
HTTP 500
{"error":{"code":500,"message":"input (2110 tokens) is too large to process.
 increase the physical batch size (current batch size: 512)","type":"server_error"}}
```

**真正的風險**:一份過長的文件會讓**整個 `/rerank` 批次**失敗。危險的不是半段文字被
評分,而是**呼叫端在那時安靜地退回未重排的順序**。

實測 chunk token 分佈(真實 `chunkDocument()` 路徑,`targetSize=480`,以
`llama-tokenize` 對著本模型的 GGUF 量):n=13,min/max/mean = **38/324/135.3**;
最壞情況(密集無標點中文,滿 480 字)**403 token**,0.84 token/字。

`E04-S089` 的 `HttpCrossEncoderProvider` 以 server 自己的 `/tokenize` + `/detokenize`
**主動截斷**(公式已對著真實 server 驗到 512 token 的邊界),並以 `onTruncated` 回報。

## 已知空白

- **未記載轉檔工具版本。** 與 embedding 那份同樣的問題,同樣的驗法(ADR 0009 R3):
  便宜的 gate 用明顯對錯的 pair;決定性的驗證是與 HF 原始模型比對分數。

## ⚠️ 接線時的守門陷阱(ADR 0009 R6)

`retrieveWithReranking` 這個接縫**已知有一個弱守門**:先前查到它可以**完全不呼叫
`rerankMmr`,而 63 條測試全綠**。

在這條路徑上再插一段,若守門不變,**reranker 沒被呼叫也不會有人知道**。這項工作的
反向驗證必須紅在**順序或分數**上,不得是「有拿到結果」。

## E04-S087:實測的端點形狀(2026-09-04,量出來的,不是查文件)

環境同 `models/embedding/README.md` 的對應段落。以下每一段都是真實 curl 與
未經編輯的回應(這裡都很短,全部貼完整,無截斷)。

### ① 進入 rerank 模式的旗標

從 `llama-server --help` 找到:

```
--rerank, --reranking   enable reranking endpoint on server (default: disabled)
                         (env: LLAMA_ARG_RERANKING)
```

啟動指令(已驗證可跑):

```bash
llama-server -m models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf --reranking -ngl 99 \
  --port 8182 --host 127.0.0.1
```

啟動 log 多一條 embedding 模式沒有的警告(不是錯誤,是 llama.cpp 自動把 pooling
從模型預設值改成 rerank 需要的值):

```
W llama_init_from_model: model default pooling_type is [-1], but [4] was specified
```

### ② 端點路徑、請求、回應——三個路徑,同一個處理器

實測 `/rerank`、`/v1/rerank`、`/v1/reranking` 三個路徑對同一個請求回傳**完全相同**
的欄位結構(已用同一組輸入分別打三個路徑比對,結構一致;下面只留 `/rerank` 的完整
輸出,另兩個路徑的輸出示於下方確認段)。

```bash
curl -s -X POST http://127.0.0.1:8182/rerank \
  -H "Content-Type: application/json" \
  -d '{
    "query": "如何更換濾網",
    "documents": [
      "更換濾網的步驟:先關閉電源,打開濾網艙蓋,取出舊濾網,裝上新濾網,再蓋回艙蓋。",
      "報稅時記得檢查扣除額項目,並在期限前完成申報以避免罰款。",
      "How to file your taxes: gather your W-2 forms, choose a filing status, and submit before the deadline.",
      "Replace the air filter every 3 months by opening the filter compartment and swapping the cartridge."
    ]
  }'
```

真實回應(完整,未截斷):

```json
{
    "model": "/data/python/AI_KM/models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf",
    "object": "list",
    "usage": { "prompt_tokens": 140, "total_tokens": 140 },
    "results": [
        { "index": 0, "relevance_score": 6.482923984527588 },
        { "index": 3, "relevance_score": -0.01437273621559143 },
        { "index": 1, "relevance_score": -11.016740798950195 },
        { "index": 2, "relevance_score": -11.01986312866211 }
    ]
}
```

**形狀**:請求是 `{query: string, documents: string[]}`;回應是
`{model, object, usage:{prompt_tokens,total_tokens}, results:[{index, relevance_score}]}`,
**`results` 已依 `relevance_score` 由高到低排序**(不是輸入順序——`index` 欄位才是
原始輸入位置,接線時要用 `index` 對回原始 passage,不能假設 `results[i]` 對應
`documents[i]`)。

`/v1/rerank` 與 `/v1/reranking` 用同一組輸入(`query: "test"`,
`documents: ["doc a", "doc b"]`)分別打過,回應逐位元組相同:

```json
{"model":"/data/python/AI_KM/models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf","object":"list","usage":{"prompt_tokens":14,"total_tokens":14},"results":[{"index":0,"relevance_score":-4.602415084838867},{"index":1,"relevance_score":-6.14724588394165}]}
```

**建議 E04-S089 接哪一個**:三個等價,選 `/rerank`(原生,路徑最短、無 OpenAI 包裝
語意上的誤導——這個端點跟 OpenAI 沒有官方對應規格,叫 `/v1/rerank` 只是 llama.cpp
自己的別名)。

### ④ 分數是原始 logit,不是 sigmoid

**判準**:sigmoid 的值域是開區間 (0, 1)。只要看到 ≥1 或 ≤0(尤其是明顯負值)就足以
排除「已 sigmoid」。

實測分數:`6.48`、`-0.01`、`-11.02`、`-11.02`(上面那組);另一組(見下方 gate ②)
測到 `1.52`、`-0.07`、`-11.02`、`-11.03`;`/v1/rerank` 確認測到 `-4.60`、`-6.15`。
**這些值遠遠超出 (0, 1),且大量出現在 −11 附近**——sigmoid 不可能產生這種分佈
(sigmoid(−11) ≈ 0.0000167,如果模型真的輸出過 sigmoid,-11 這個數字根本不會出現
在 API 回應裡,因為 API 回的會是那個 0.0000167,而不是 -11)。**結論:llama.cpp
這個 rerank 端點回傳的是原始 logit,未經 sigmoid**。E04-S089 若要映到 [0,1]
（例如要跟其他分數混合排序),要自己套 `sigmoid(x) = 1 / (1 + exp(-x))`。

### ⑤ 顯存

見 `models/embedding/README.md` 對應段落(同一次量測,兩份都貼)。摘要:單獨開
rerank server(`-ngl 99`)量到 392–398 MiB;與 embedding server 同時開共
780 MiB;全部關閉後回到基線 5 MiB。

## ADR 0009 R3「便宜的 gate」——結果:通過(兩組中英混合 pair 都排序正確)

**這個 gate 抓得到嚴重損壞(轉檔壞到把明顯相關排到明顯不相關後面),抓不到輕微
退化(分數準不準、排序在伯仲之間的 pair 排得對不對)。決定性的驗證——同一批 pair
同時跑 GGUF 與 HF 原始模型比對分數——不在本 story 範圍,留給後續。以下只證明
「沒有嚴重損壞」,不代表「轉檔沒問題」。**

**組 1(中文 query)**:query = 「如何更換濾網」;documents = [中文換濾網步驟(相關)、
中文報稅提醒(不相關)、英文報稅提醒(不相關)、英文換濾網提醒(相關)]。

結果(見②的完整輸出):相關的兩筆(index 0 中文 6.48、index 3 英文 -0.01)分數都
遠高於不相關的兩筆(index 1、index 2 皆 ≈ -11.02)。**排序正確**:兩個相關的都排在
兩個不相關的之前,不因語言不同而反轉。

**組 2(英文 query)**:

```bash
curl -s -X POST http://127.0.0.1:8182/rerank -H "Content-Type: application/json" -d '{
    "query": "How do I reset my password?",
    "documents": [
      "To reset your password, click Forgot Password on the login page and follow the emailed link.",
      "忘記密碼時,點選登入頁面的「忘記密碼」,依照收到的郵件連結進行重設。",
      "本季財報顯示營收成長百分之十二,主要來自海外市場擴張。",
      "The quarterly earnings report shows a 12 percent revenue increase driven by overseas expansion."
    ]
  }'
```

真實回應(完整,未截斷):

```json
{
    "model": "/data/python/AI_KM/models/rerank/BGE-Reranker-v2-M3-Q8_0.gguf",
    "object": "list",
    "usage": { "prompt_tokens": 126, "total_tokens": 126 },
    "results": [
        { "index": 0, "relevance_score": 1.5175559520721436 },
        { "index": 1, "relevance_score": -0.07225990295410156 },
        { "index": 3, "relevance_score": -11.01883316040039 },
        { "index": 2, "relevance_score": -11.025568008422852 }
    ]
}
```

相關的兩筆(index 0 英文 1.52、index 1 中文 -0.07)都遠高於不相關的兩筆
(index 2、index 3 皆 ≈ -11.02)。**排序正確**。

**結論**:兩組、中英各當過 query 語言,轉檔沒有出現「明顯相關排在明顯不相關之後」
這種嚴重損壞的訊號。**這不代表分數精確或轉檔完全無損**——同語言的相關 passage
(6.48、1.52)與跨語言的相關 passage(-0.01、-0.07)分數差距不小,這種細微程度的
準確性只有跟 HF 原始模型比對分數才驗得出來,本 story 不做這件事。

### ⚠️ 2026-09-04 更正:上面那句「跨語言分數差距不小」不要外推成「餘裕很薄」

協調者當初據此寫下「若用分數門檻過濾,跨語言的相關段落很可能被砍掉」。**在真實文件上不成立。**

以 `1706.03762v7.pdf`(15 頁,104 個 chunk)建索引後,中文問句對英文段落的重排分數是
**0.952 / 0.937 / 0.890**(sigmoid 後),完全不薄。

上面那組數字來自**四份文件的合成樣本**——在那麼小的集合裡,分數落在哪裡受集合本身的組成
支配,不代表真實語料的分佈。**量到的東西要能支撐你從它推出去的距離**;那次外推超出了它。

同一次實跑也證明了重排在做事:同一個中文問句下,dense 的第一名被降到第 5,而
`3.2.2 Multi-Head Attention` 那一段從 dense 第 4 升到第 1——四個問題裡唯一一次第一名改變,
而且改對了。
