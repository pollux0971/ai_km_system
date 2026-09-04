---
description: 驗收一個 phase(ADR 0008)。跑場景、跑單獨執行指令、跑反向驗證、列人工確認清單。防止「感覺做完了」就標記完成。嚴格級 phase 由另一個 session 執行。
---

# /phase-done — 驗收

目標:`$ARGUMENTS`(格式 `<NN-name>/<phase-N>`)

## 第一步:定位

解析為 `features/<NN-name>/phase-<N>.feature`。找不到就停,列出該資料夾有哪些 phase。
讀取該 `.feature`、該資料夾的 `FEATURE.md` 與 `NEXT.md`、`docs/01-roadmap.md` 找出所屬整合點。

## 第二步:前置檢查

- 狀態必須是 `in-progress`。`todo`/`ready` → 回報「尚未開始」並停。`done` → 回報完成日並停。
- `NEXT.md` 的三類 gate 必須都滿足。有未滿足的,列出並停。
- **嚴格級**(FEATURE.md 技術棧表):本 session 不得是開發該 phase 的 session。是 → 停,回報需另開 session。
- 角色守門:`git diff --name-only main...HEAD | grep -E '\.test\.ts$|^features/steps/|\.feature$'`
  若開發 agent 的 commit 動了這些檔 → 列出並停(ADR 0008 §4)。

## 第三步:自動場景

```
pnpm --filter @ai-km/features accept -- --tags "@<name> and @phase-<N> and not @manual and not @e2e"
```

記錄:通過數、失敗數、undefined 數(**undefined = 還沒做**,不算 done)、失敗場景與錯誤摘要。
`@e2e` 場景走 CI 的 Playwright job,附 run URL。

## 第四步:單獨執行

從根目錄的 `standalone.json` 取出該能力的項目,**實際執行 `cmd`**(不繼承 `NODE_OPTIONS`)。

- `interactive: false` → 跑它,退出碼等於 `expectExit ?? 0` 且輸出含 `expect` 字串 → 通過
- `interactive: true` → 無法自動驗,列進 `@manual` 清單
- 跑不起來 → **不算 done**,即使所有場景都過。這是核心項目

## 第五步:反向驗證

依 FEATURE.md 的級別:

| 級別 | 做法 |
|---|---|
| **嚴格** | 至少一個決定性場景用 `tools/mutate.mjs`(或手動改壞→紅→還原→綠,說明為何工具不適用)。**未做不算 done** |
| 標準 | 至少一個場景做過;沒做回報但不擋,問使用者要不要補 |

檢查證據形式:commit body 必須含**炸掉那條斷言的失敗訊息原文**,且該訊息說的是決定性性質
(資料不變、分數、順序、身分),不是副作用(沒拋錯、型別不對)。只寫「N failed」的不算。

## 第六步:回填對照表(phase-1 專用)

phase-1 的每個場景必須在 FEATURE.md「回填對照表」有一列,指向既有測試檔:測試名。
缺列 → 不算 done。步驟定義必須呼叫與該測試相同的入口(抽查兩個)。

## 第七步:@manual 場景

列出所有 `@manual` 場景加上第四步無法自動驗的:

```
## 需要你親手確認

- [ ] Scenario: …
      預期:…
- [ ] 單獨執行:`pnpm --filter @ai-km/web dev` 能啟動且顯示 …
```

問:「以上都確認過了嗎?哪些沒過?」**等回覆。**

## 第八步:判定

**核心四項全過** → done:
1. 非 `@manual` 場景全過(零 undefined)
2. 單獨執行通過(或 interactive 且使用者確認)
3. 嚴格級反向驗證已做且證據形式正確(標準級不擋)
4. 使用者確認所有 `@manual`

### 若 done

1. `FEATURE.md` 該 phase 狀態改 `done`,填完成日
2. 更新 `NEXT.md`:已完成加這個 phase、下一個改成下一個 phase;重新評估下一個 phase 的三類 gate
3. 掃其他資料夾的 `NEXT.md`,有哪些 phase 因此 gate 滿足 → 列出
4. 檢查該整合點的所有 phase 是否都 done → 若是,提示可以跑 `/integrate`
5. `docs/01-roadmap.md` 回填進度或整合點表更新
6. 建議 `git tag <NN-name>/phase-<N>`
7. 回報:
   ```
   ✓ <NN-name>/phase-<N> 完成
   - 自動場景 X / X
   - 單獨執行:通過
   - 反向驗證:<場景名> ← <突變> → 紅在「<訊息>」;還原綠
   - 人工場景 Y / Y
   - 新解鎖的 phase:…
   - 整合點進度:…
   ```

### 若未通過

不改任何狀態。逐項列出哪一步沒過、為什麼。

## 第九步:順帶檢查

Grep `TODO` `FIXME` `HACK` `console.log`,列出並問要處理還是留著。留著就寫進 FEATURE.md 開放問題。
問:「這個 phase 有沒有做什麼取捨還沒記 ADR?」有就提示 `/decide`。

## 禁止事項

- 不在單獨執行指令跑不起來時標 done
- 不在嚴格級反向驗證未做時標 done
- 不在 `@manual` 未確認時標 done
- 不修改 `.feature` 讓它通過(要改規格先走 `/feature`)
- 不為了通過而調低級別或改 `standalone.json` 的 `expect`
