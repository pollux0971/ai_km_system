# `verify-asr` 測試音檔(不進 git)

`verify-asr` 需要一個真人錄的、中英夾雜的音檔,放在這個資料夾,檔名
**`sample-zh-en.wav`**。這個檔案(以及任何 `.wav`)已被根 `.gitignore`
排除,不會被 commit(見 `../../src/gitignore.test.ts` 的自動驗證)。

## 錄什麼

請用自然語速唸出以下句子(繁體中文夾雜英文技術詞彙,約 8–15 秒):

> 請幫我確認一下這個 API 的 error code,然後把 deadline 更新到系統裡,謝謝。

不需要照稿逐字唸,只要內容涵蓋這幾個關鍵詞即可(見下方 `expected.json`)。
如果唸起來明顯短於 8 秒,可以自然地重複一次關鍵資訊拉長到 8–15 秒
(例如再補一句「deadline 大概是明天下午」)。

## 錄音規格

- **格式**:16 kHz、mono、PCM16 WAV(與 E03-S040 前端錄音器產出的格式
  一致,`verify-asr` 直接把這個檔案送給 whisper-server,不做任何轉檔)。
- **時長**:8–15 秒。
- **內容語言**:繁體中文為主,夾雜英文技術詞彙(`API`、`error code`、
  `deadline`)——這正是 ADR 0004 §5 要驗證的真實使用情境(純中文或純
  英文都無法驗證中英夾雜的辨識品質)。

### 用系統麥克風錄成 16kHz mono WAV 的兩種方式

**方式一:`ffmpeg`(推薦,大多數 Linux 發行版可用 `apt install ffmpeg`)**
```bash
ffmpeg -f alsa -i default -ac 1 -ar 16000 -sample_fmt s16 sample-zh-en.wav
# 錄完按 Ctrl+C 停止
```

**方式二:`arecord`(ALSA 內建,通常不用額外安裝)**
```bash
arecord -f S16_LE -c 1 -r 16000 -d 12 sample-zh-en.wav
# -d 12 = 錄 12 秒後自動停止,可依需要調整
```

錄完後把檔案放到這個資料夾(`tools/asr-readiness/fixtures/
sample-zh-en.wav`),即可執行:
```bash
pnpm --filter @ai-km/tool-asr-readiness verify-asr
```

## `expected.json`

已提交進 git(內容只是關鍵詞清單,不是音檔本身,沒有敏感性)。如果你
唸的句子關鍵詞跟預設不同,直接編輯這個檔案即可,不需要改任何程式碼:

```json
{
  "keywords": ["確認", "API", "error code", "deadline", "系統"]
}
```

`verify-asr` 會把辨識結果(先經 OpenCC 轉繁體)逐一比對這幾個關鍵詞
(子字串比對,不分詞),命中率 ≥ 80%(5 個關鍵詞中至少對 4 個)且結果
確認是繁體(無簡體字元殘留)才算通過。
