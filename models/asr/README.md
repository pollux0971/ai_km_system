# ASR 模型與 whisper.cpp 建置指引(E12-S030)

本資料夾放 whisper.cpp 的模型檔(`.bin`)。**模型檔本身不進 git**(根
`.gitignore` 的 `models/asr/*.bin`,已用 `tools/asr-readiness/src/
gitignore.test.ts` 驗證真的生效)——這份 README 是「在乾淨機器上重建
這個資料夾內容」唯一的依據。

## 1. 取得 whisper.cpp

Repo:<https://github.com/ggerganov/whisper.cpp>(`ggerganov/whisper.cpp`)。
**Clone 到 repo 外**(例如 `~/whisper.cpp`,不要放進本 repo),兩種方式
擇一:

### 方式 A:官方預編譯版(Windows,cuBLAS)
GitHub Releases 頁面下載已含 cuBLAS 的 Windows 版,解壓即可,不需要
自行編譯。

### 方式 B:自行以 CUDA 建置(Linux/WSL,本 story 實際驗證過)
```bash
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp
cmake -B build -DGGML_CUDA=1 -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CUDA_HOST_COMPILER=/usr/bin/g++-12 \
  -DCMAKE_CUDA_ARCHITECTURES=75
cmake --build build --config Release -j
```

**`-DCMAKE_CUDA_HOST_COMPILER=/usr/bin/g++-12` 是必要參數,不是可省略的
建議**:CUDA 12.0 的 nvcc 官方只支援到 gcc 12,如果系統預設 gcc 是更新的
版本(例如 gcc 13),不指定這個參數會編譯失敗。用 `g++ --version` 確認
系統實際裝了哪個版本,`update-alternatives --list g++` 或直接找
`/usr/bin/g++-12` 是否存在;如果沒有 12 版,先 `apt install g++-12`(或
對應發行版的套件)。

`-DCMAKE_CUDA_ARCHITECTURES=75` 對應 Turing 架構(GTX 16xx/RTX 20xx 系列
compute capability 7.5)。RTX 4070 是 Ada Lovelace(compute capability
8.9),部署機建置時應改成 `-DCMAKE_CUDA_ARCHITECTURES=89`(或用
`nvidia-smi --query-gpu=compute_cap --format=csv` 查詢實際數值)。

建置完成後,可執行檔在 `build/bin/whisper-server`(Linux)或
`build\bin\Release\whisper-server.exe`(Windows)。把它加進 `PATH`,或
設定環境變數 `AI_KM_ASR_SERVER_BIN` 指向這個路徑——`check-asr`/
`verify-asr`/`scripts/asr-server.sh` 都會依這個順序找。

### 已知效能提示(選用,未套用)
whisper.cpp 建置時會提示 GTX 1650 這類 Turing 卡缺 tensor core,建議改用
`-DCMAKE_CUDA_ARCHITECTURES=61-virtual;80-virtual` 搭配
`-DGGML_CUDA_FORCE_MMQ=1` 走 Pascal 相容路徑會更快。本 story 驗證時
目前設定(`75`,無 FORCE_MMQ)的速度已足夠(11 秒音檔耗時約 2.7 秒),
未套用這個優化;之後若需要更快的推論速度,可以自行嘗試。

## 2. 下載模型

來源:Hugging Face `ggerganov/whisper.cpp`(GGML 格式模型)。放進**這個
資料夾**(`models/asr/`),不要放進 whisper.cpp 自己的目錄——與
E04-S037 的 LLM/embedding 模型(`models/`)分開,避免 `verify-models`
誤掃。

| 檔名 | 大小 | 精度 | 建議機器 |
|---|---|---|---|
| `ggml-large-v3-turbo.bin` | 約 1.6 GB | F16 | VRAM ≥ 4.5 GB(見下方判斷) |
| `ggml-large-v3-turbo-q5_0.bin` | 約 548 MB | Q5_0(量化) | VRAM 較緊的機器 |

`check-asr` 會依實際偵測到的 VRAM **動態**建議該用哪一個(門檻與理由見
`tools/asr-readiness/src/check-asr.ts` 的 `F16_MIN_VRAM_MIB`),不是寫死
特定顯卡型號。兩個檔案可以同時下載,`check-asr` 會列出實際找到哪些。

下載範例(Hugging Face CLI 或直接用 `curl`/瀏覽器皆可,自行選擇):
```bash
curl -L -o models/asr/ggml-large-v3-turbo-q5_0.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
curl -L -o models/asr/ggml-large-v3-turbo.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
```

## 3. 驗證

```bash
pnpm install
pnpm --filter @ai-km/tool-asr-readiness check-asr
```
應輸出 GPU/VRAM、whisper-server 是否找到、模型是否找到、建議量化。三態
報告(✅ 就緒／⚠️ 可用但非最佳／❌ 尚未就緒),❌ 或 ⚠️ 時會附下一步指引。

啟動 sidecar(用 `check-asr` 建議的模型檔名):
```bash
tools/asr-readiness/scripts/asr-server.sh ggml-large-v3-turbo-q5_0.bin
```

錄好測試音檔(見 `tools/asr-readiness/fixtures/README.md`)後:
```bash
pnpm --filter @ai-km/tool-asr-readiness verify-asr
```

## 4. 本機環境紀錄(2026-08-28,總指揮實測,供對照)

- 開發機:**GTX 1650,4 GB VRAM**(不是 spec 原先假設的 4070)。
  - `ggml_cuda_init: found 1 CUDA devices`
  - `Device 0: NVIDIA GeForce GTX 1650, compute capability 7.5, VRAM 3716 MiB`
  - `whisper_model_load: CUDA0 total size = 573.45 MB`(q5_0 模型整個進
    GPU)
  - `whisper-server --host 127.0.0.1 --port 8178` 啟動成功,`POST
    /inference` 回 HTTP 200,11 秒音檔耗時約 2.68 秒。
  - 因此本機**q5_0 是實際可用版本**,F16 在 4 GB 卡上約需 2.5–3 GB,
    很緊,`check-asr` 的門檻設計已將此納入考量。
- 部署機:**RTX 4070,12 GB VRAM**——**使用者 2026-08-28 已確認目前沒有
  這台機器**,依 spec 記為 `BLOCKED_DEPENDENCY`(見
  `docs/stories/E12-S030.md`),不得因此降低驗收標準改成單機通過。
