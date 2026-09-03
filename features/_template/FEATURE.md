# NN · name

## 一句話

(這個能力讓使用者做得到什麼。)

## owner

(一個名字或 session 代號。跨資料夾的改動走 `/feature` 分流,不走 owner 私下協調。)

## 範圍

- (每一條都是 `/feature` 判斷「屬不屬於這裡」的依據,要具體。)

## 不在範圍

- (明確排除的,以及它屬於哪個資料夾。)

## 來源

- 契約:`contracts/openapi/<x>.yaml`
- 舊 story(素材,不是規格):EXX-SYYY, …
- 規格庫有內容的段落:`AI_KM_BMAD_High_Granularity/SOURCE_BASELINE.md` §N(若有)

## 單獨執行

```bash
(一行可以複製貼上的指令,通常是 `pnpm --filter @ai-km/features accept -- NN-name --tags '@standalone and not @manual'`;
 service 類另加「用 fake provider 起 API、打一個代表性請求、印一個 marker」的指令。)
```

預期輸出:(描述跑起來會看到什麼。)

**同時要加進根目錄的 `standalone.json`**——那是驗收時實際讀取的來源,這裡只是說明。

## 依賴

**phase-1(回填)**:只依賴 `contracts/` 與自己的 service/UI 既有碼。

| 後續 phase | 需要 | 原因 |
|---|---|---|
| phase-2 | | |

## 技術棧

| 項目 | 選擇 | 備註 |
|---|---|---|
| 語言 | TypeScript | |
| 測試 | vitest(單元)+ cucumber(驗收)+ `tools/mutate.mjs`(反向驗證) | |
| 級別 | 嚴格 / 標準 / 寬鬆 | 嚴格 = 觸及授權／可見性／稽核,或失敗模式靜默(ADR 0008 §4) |

## Phase

| Phase | 標題 | 整合點 | 狀態 | 完成日 |
|---|---|---|---|---|
| 1 | (回填)… | I1 | todo | |

## 回填對照表(phase-1)

| 場景 | 綁到的既有測試(檔:名) |
|---|---|
| | |

## 驗收方式

(自動測試跑什麼;`@manual` 怎麼確認;mutate 對哪個場景做過反向驗證。)

## 開放問題

-
