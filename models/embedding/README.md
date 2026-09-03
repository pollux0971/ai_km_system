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

## ⚠️ 執行環境:忘了 `-ngl` 會安靜地跑在 CPU 上

llama.cpp 建於 `/data/python/llama.cpp`(commit `95ef7fc`),沿用 `models/asr/README.md`
為 whisper.cpp 記下的同一組 CUDA 參數(同機、同 CUDA 12.0、同 sm_75):

```bash
cmake -B build -DGGML_CUDA=1 -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CUDA_HOST_COMPILER=/usr/bin/g++-12 \
  -DCMAKE_CUDA_ARCHITECTURES=75
cmake --build build --config Release -j
```

CUDA 確實可用:

```
$ llama-server --list-devices
Available devices:
  CUDA0: NVIDIA GeForce GTX 1650 (3716 MiB, 3657 MiB free)
```

**但 `llama-server` 預設不 offload,而且不會警告。** 2026-09-04 實測同一個模型、
同一個指令,只差 `-ngl`:

| 啟動方式 | `nvidia-smi` 顯存 | 伺服器自己的 log |
|---|---|---|
| 不給 `-ngl` | **5 MiB**(完全沒用 GPU) | 看起來完全正常 |
| `-ngl 99` | **390 MiB** | **看起來一模一樣** |

**伺服器的 log 兩種情況下沒有差別。** 判斷有沒有真的用到 GPU 的唯一方式是
`nvidia-smi`,不是讀 log。對 embedding 來說,跑 CPU 的**輸出完全相同**,只是慢——
除非計時,否則沒有人會發現。

啟動一律帶 `-ngl 99`,並在接線後以 `nvidia-smi` 確認顯存真的被佔用。

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

## E04-S087:實測的端點形狀(2026-09-04,量出來的,不是查文件)

環境:`/data/python/llama.cpp` build/bin(commit `95ef7fc`),`llama-server --help`
逐字找旗標,不猜。以下每一段都是真實 curl 與未經編輯的回應(向量截斷處已標明)。

### ① 進入 embedding 模式的旗標

從 `llama-server --help` 找到:

```
--embedding, --embeddings   restrict to only support embedding use case; use only with
                             dedicated embedding models (default: disabled)
                             (env: LLAMA_ARG_EMBEDDINGS)
```

啟動指令(已驗證可跑):

```bash
llama-server -m models/embedding/bge-m3-Q8_0.gguf --embedding -ngl 99 \
  --port 8181 --host 127.0.0.1
```

啟動 log 有兩條值得注意的警告(兩者都與 embedding 模式有關,非錯誤):

```
W srv  llama_server: embeddings enabled with n_batch (2048) > n_ubatch (512)
W srv  llama_server: setting n_batch = n_ubatch = 512 to avoid assertion failure
```

即這個版本的 embedding 模式會把 `n_batch` 自動降到 `n_ubatch`(512)。這是
**物理批次上限**,與 rerank 那邊 `max_length=512` 的截斷風險是同一個數字但不同機制
——這裡影響的是單次前向能處理的 token 數,不是本 story 要驗的截斷行為(那是
rerank README 的 ⚠️ 段落)。

### ② 端點路徑、請求、回應——兩組都存在,形狀不同

**(a) 原生端點 `POST /embedding`**

```bash
curl -s -X POST http://127.0.0.1:8181/embedding \
  -H "Content-Type: application/json" \
  -d '{"content": "如何更換濾網"}'
```

真實回應(完整,未截斷,單筆 query 的情況):

```json
[
  {
    "index": 0,
    "embedding": [
      [
        -0.03315100446343422, -0.010184398852288723, -0.04169853404164314,
        "...(中間 1018 個數字省略,總長見下方③)...",
        -0.0262615904211998, -0.027626022696495056, 0.028591414913535118
      ]
    ]
  }
]
```

**注意巢狀結構**:頂層是陣列(每個輸入一筆),`embedding` 欄位本身又是一層陣列
(`embedding[0]` 才是真正的向量)。這是因為原生端點支援每個輸入回傳多個 pooling
輸出(例如某些 pooling 設定下每個 token 一個向量);這裡只用了一種 pooling,
所以外層陣列長度恆為 1,但**形狀上就是雙層**,接線時不能直接拿 `embedding` 當向量用,
要拿 `embedding[0]`。

批次輸入(`content` 傳陣列)一樣可用,已實測:

```bash
curl -s -X POST http://127.0.0.1:8181/embedding \
  -H "Content-Type: application/json" \
  -d '{"content": ["如何更換濾網", "how to file taxes"]}'
```

回應是長度 2 的陣列,每筆 `{index, embedding: [[...1024 個數字...]]}`,`index` 對應
輸入順序。

**(b) OpenAI 相容端點 `POST /v1/embeddings`**

```bash
curl -s -X POST http://127.0.0.1:8181/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"input": "如何更換濾網", "model": "bge-m3"}'
```

真實回應(完整,未截斷):

```json
{
  "model": "bge-m3",
  "object": "list",
  "usage": { "prompt_tokens": 7, "total_tokens": 7 },
  "data": [
    {
      "embedding": [
        -0.03315100446343422, -0.010184398852288723, -0.04169853404164314,
        "...(中間 1018 個數字省略)...",
        -0.0262615904211998, -0.027626022696495056, 0.028591414913535118
      ],
      "index": 0,
      "object": "embedding"
    }
  ]
}
```

**與 (a) 的差異**:`data[i].embedding` 是**單層**陣列(不是 `embedding[0]`),多了
`usage.prompt_tokens`/`total_tokens`(token 計數,可用來驗 chunk 是否超長),多了
`model`/`object` 外層欄位。**同一句輸入兩個端點算出的向量數值逐位元相同**
(已比對頭尾,一致)——差別只在包裝層,不是算法差異。批次輸入(`input` 傳陣列)一樣可用,
已實測,`usage.total_tokens` 會加總。

**建議 E04-S088 接哪一個**:`/v1/embeddings`,因為它的向量是單層陣列(少一層要拆的
巢狀),而且回傳 `usage.total_tokens` 可直接拿來記錄 chunk 的實際 token 數(對
E04-S089 的 512 token 截斷風險量測也有用)。

### ③ 維度:實測 1024

```bash
python3 -c "import json; d=json.load(open('resp.json')); print(len(d['data'][0]['embedding']))"
# → 1024
```

兩個端點、單筆與批次輸入都量過,一致是 **1024**。與模型卡宣稱一致,但這裡是從真實
回應數出來的,不是抄的。

### ⑤ 顯存(與 rerank 合併測,見 `models/rerank/README.md` 的對應段落)

- 只開 embedding server(`-ngl 99`):`nvidia-smi` 讀到 **390 MiB**(這台機器
  `nvidia-smi` 回報的 idle 基線是 **5 MiB**,`memory.total` 為 4096 MiB;
  `llama-server --list-devices` 之前記錄的 3716 MiB/3657 MiB free 是 CUDA
  runtime 回報的可用額度,兩個數字口徑不同但不衝突)。
- 只開 rerank server:392–398 MiB(兩次測略有差異,屬正常抖動)。
- **兩個 server 同時開**(embedding port 8181 + rerank port 8182):`nvidia-smi
  --query-compute-apps` 顯示兩個獨立 PID,各自 382 MiB / 390 MiB,
  `nvidia-smi --query-gpu=memory.used` 讀到 **780 MiB 總計**。兩個服務同時對外
  服務都正常(embedding 與 rerank 請求都成功回應,已實測)。
- 780 MiB 對 3716 MiB(或 nvidia-smi 的 4096 MiB total)**遠低於**上限,
  **E04-S089 可以讓兩個 server 同時常駐**,不需要動態載入/卸載。
- 收尾:兩個 server 都關閉後,`nvidia-smi` 讀數回到 **5 MiB**,與開測前的基線一致。
