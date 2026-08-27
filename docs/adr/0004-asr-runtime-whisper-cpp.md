# ADR 0004: 語音辨識（ASR）在伺服器端以 whisper.cpp `whisper-server` sidecar 執行

Status: Proposed（使用者 2026-08-28 拍板：伺服器端 whisper、中英文混合、
push-to-talk + 自動送出、先不做 TTS）

## Context

開發機 GPU 為 GTX 1650（4GB VRAM，Turing），部署機為 RTX 4070（12GB）。
語音內容為台灣國語為主、夾雜英文術語。瀏覽器端 ASR（transformers.js）被排除：
首次載入大、弱機慢、中文品質不穩。E04-S037 已把地端推論定為 Node 生態
（node-llama-cpp）；但 whisper.cpp 的 Node binding 生態維護度參差、CUDA
build 支援不一，直接綁進 API process 會把 ASR 崩潰風險帶進主 API。

## Decision

1. **Runtime**：ASR 以 **whisper.cpp 官方 `whisper-server`**（examples/server）
   作為獨立 sidecar process 執行（CUDA build：`cmake -B build -DGGML_CUDA=1`；
   Windows 可用 release 頁的 cuBLAS 預編譯版），監聽 `127.0.0.1:8178`，
   只接受 loopback。`apps/api`（`services/model-gateway`）以 HTTP 呼叫其
   `POST /inference`，不在 Node process 內載入模型。
2. **Provider 抽象**：`TranscriptionProvider` 介面（`transcribe(wav, opts)`）；
   實作 `WhisperServerProvider`（正式）與 `FakeTranscriptionProvider`
   （unit/E2E 用，回傳可預期文字），以 `AI_KM_ASR_PROVIDER=whisper-server|fake`
   切換；production 預設 `whisper-server`，`fake` 只在明確設定時啟用。
   未來換 faster-whisper／sherpa-onnx 只需新增 provider。
3. **模型**：預設 `ggml-large-v3-turbo.bin`（f16，約 1.6GB；1650/4070 皆可
   全量放進 VRAM）；VRAM 吃緊時降 `ggml-large-v3-turbo-q5_0.bin`。模型放
   `models/asr/`（gitignored；與 E04-S037 的 `models/` LLM/embedding 檔案
   分目錄，避免 `verify-models` 誤掃）。聯發科 **Breeze-ASR-25**（台灣國語
   + 中英夾雜微調）列為後續評估選項（需自行轉 ggml），不在本批 story 內。
4. **音訊格式**：瀏覽器端錄音直接產出 **16kHz mono PCM16 WAV**（AudioWorklet
   + 重取樣），server 不需要 ffmpeg；限制單段 ≤ 60 秒、≤ 4MB。
5. **中英混合與繁體化**：`language=zh` + `prompt`「以下是台灣繁體中文與英文
   混合的工作對話。」引導；輸出再經 OpenCC（`opencc-js`，`cn→twp`）強制繁體
   台灣用語，英文與數字原樣保留。不做 auto language detect（實測易在中英
   夾雜句切換語系造成整句英譯）。
6. **互動模式**：push-to-talk（按一下開始／再按一下或靜音自動結束），辨識
   完成後**自動送出**為一則使用者訊息；不做即時逐字幕（Whisper 非串流
   模型；留待後續 story 評估 sherpa-onnx 串流方案）。
7. **隱私**：不保存原始音檔；telemetry/log 只記 metadata（時長、字數、
   耗時、provider/model），不記辨識文字。

## Consequences

- 需要新 contract `contracts/openapi/transcriptions.yaml`（E12-S029）。
- 需要類似 E04-S037 的環境就緒工具與手動模型下載流程（E12-S030）；
  L3 必須以真實中英夾雜音檔通過，fake provider 不算整合證據。
- `getUserMedia` 需要 secure context：正式部署必須 HTTPS（使用者確認應有），
  `http://<內網IP>` 存取時語音按鈕必須以明確訊息停用而非靜默失效
  （repo 先前已有 LAN http 存取的 `crypto.randomUUID` polyfill 紀錄）。
