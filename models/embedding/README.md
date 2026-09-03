# Embedding 模型:bge-m3(GGUF)

ADR 0009 D2。**權重不進 git**(`.gitignore` 的 `models/embedding/**`);這份 README 進,
因為它記的是「哪一個檔案」而不是「某個 bge-m3」。

## 這台機器上實際存在的檔案

| | |
|---|---|
| 檔名 | `bge-m3-Q8_0.gguf` |
| 來源 | Hugging Face `smarttasks/bge-m3-GGUF` |
| 上游模型 | `BAAI/bge-m3` |
| sha256 | `aa473d51f451a22f0fcf39ba3330c14bed38a385712b1113440f69df4047a173` |
| bytes | `634553760`(頁面標示 634.6 MB) |
| 取得日期 | 2026-09-04 |

## 取得方式

```bash
hf download smarttasks/bge-m3-GGUF bge-m3-Q8_0.gguf --local-dir models/embedding
sha256sum models/embedding/bge-m3-Q8_0.gguf   # 必須等於上表
```

**sha256 對不上就不要用。** 這是社群轉檔,而轉壞的 embedding 模型**不會 crash,只會
讓排序變差** —— 沒有東西會替你報錯。

## 已知的限制與空白(不要在別處重新發現一次)

- **只支援 dense。** 來源頁面明說 *"These scores are for standard single-vector dense
  retrieval"*,bge-m3 的 sparse / ColBERT 模式在這個量化版本裡**未啟用**。若日後要對
  error code、料號這類識別碼做精確匹配,走 **SQLite FTS5 / BM25** 另建詞彙索引,
  不要期待這個檔案給你稀疏權重。
- **來源頁面未標授權。** 上游 `BAAI/bge-m3` 是 MIT,但這份再散布沒有寫。正式落地前
  應補來源說明,或改用有標授權的轉檔。
- **未記載轉檔工具版本。** 頁面沒說用哪個版本的 `convert_hf_to_gguf.py` 轉的。
  這是 ADR 0009 R3 要求驗證的原因。

## 驗證(ADR 0009 R3)

採用前兩層:

1. **便宜的 gate**:一組明顯對錯的 (query, passage)。明顯相關的若被排在明顯不相關的
   後面,轉檔就是壞的。抓得到嚴重損壞,抓不到輕微退化。
2. **決定性的**:同一批 pair 同時跑這個 GGUF 與 HF 原始模型,**比對分數**。

## 維度

輸出 1024 維。這取代 `services/model-gateway/src/config.ts` 的
`DEFAULT_EMBEDDING_DIMENSIONS = 256`(那是 deterministic 佔位 provider 的值)。

換模型會讓既有向量失效,而這是**會出聲的**:`E06-S026` 的
`EmbeddingIdentity { model, dimensions }` 讓 vector store 拒絕拿不同函式產生的向量
排序。代價是重新索引一次,不是隱性的品質衰退。
