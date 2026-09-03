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

## ⚠️ `max_length = 512` 會靜默截斷

query + passage 必須一起塞進 512 token。**超過就截斷,而截斷不報錯** —— 它會拿半段
文字去評分,分數看起來完全正常。

接線前必須量出目前 chunk 的實際 token 分佈,並對超長的情況做出**明確**處理
(拒絕,或明確截斷並記錄)。不得讓它安靜發生。

## 已知空白

- **未記載轉檔工具版本。** 與 embedding 那份同樣的問題,同樣的驗法(ADR 0009 R3):
  便宜的 gate 用明顯對錯的 pair;決定性的驗證是與 HF 原始模型比對分數。

## ⚠️ 接線時的守門陷阱(ADR 0009 R6)

`retrieveWithReranking` 這個接縫**已知有一個弱守門**:先前查到它可以**完全不呼叫
`rerankMmr`,而 63 條測試全綠**。

在這條路徑上再插一段,若守門不變,**reranker 沒被呼叫也不會有人知道**。這項工作的
反向驗證必須紅在**順序或分數**上,不得是「有拿到結果」。
