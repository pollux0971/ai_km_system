# integration/ — 分階段整合的 Gherkin

每個檔案是一個整合點的驗收規格。與 `features/*/phase-N.feature` 的差別:

| | features/ | integration/ |
|---|---|---|
| 驗什麼 | 一個能力的行為 | 能力串起來之後,**使用者做得到什麼** |
| 依賴 | contracts + fixture + 假 provider | 真的能力,沒有 stub(模型仍可 PF1 假,除非標 `@model`) |
| 資料 | fixture | 真的 SQLite、真的 PDF、真的 UI |
| 通過的意思 | 這塊做完了 | **系統是完整可用的** |

## 鐵則

每個整合的 Gherkin 都必須有至少一個 `@e2e` 場景,描述**一個人從頭到尾做完一件有意義的事**。
寫不出這樣的場景,那個整合點就切錯了——重切,不要湊。

`@e2e` 場景**由使用者親手確認**,不能被任何測試代替(範式 Definition of Integrated)。
測試全綠但使用者說做不到,就是沒整合完。

## 整合點(ADR 0008 §2)

| 整合 | 你做得到什麼 | 狀態 |
|---|---|---|
| I1 | 一份真實 PDF 進去,引用能 slice 回原文 | ✓ 2026-09-03(使用者親眼確認 W1-00 引用) |
| I2 ★ | 在 apps/web 問一個問題,答案來自 I1 的管線,點引用回到原文段落 | 下一個 |
| I3 | 兩個部門的人問同一題,各自只看到自己部門的文件;換部門後立刻生效 | |
| I4 | 從 UI 上傳一份文件,看得到它排隊／處理／可問;壞檔會說原因 | |
| I5 | 對答案按 OK/NG,管理員在 admin 看到真實聚合 | |
| I6 | 管理員從 admin 管部門與群組,改了 I3 立刻反映 | |
| I7 | 稽核:誰在何時問了什麼、看到哪些文件,可匯出 | |
| I8 | 維修助理與 ERP 報表跑在真資料上 | 待使用者定義後端來源 |
| I9 | on-prem 部署:一台機器 docker 起來,I2～I7 全部做得到 | |

**I2 是關鍵**:那是體驗層第一次接上資料層,產品第一次有價值。

## 執行

```bash
pnpm accept:integration                                            # 全部非 @manual 非 @e2e
pnpm --filter @ai-km/features accept -- ../docs/integration --tags '@i1 and not @manual and not @e2e'
```

`@e2e` 場景走 Playwright(`tests/e2e/`,只在 CI)或由 `/integrate` 貼原文給使用者確認。
`@model` 場景需要真模型(PF3),本機不跑、CI 跳過。

## Tag 慣例

- `@integration` — 全部整合檔都有
- `@i1`..`@i9` — 哪個整合點
- `@e2e` — 端到端的那個關鍵場景(每個檔至少一個),由人確認
- `@regression` — 驗證前一個整合點的能力沒被弄壞
- `@manual` — 人眼確認
- `@model` — 需要真模型(PF3)

## Regression 是刻意的

每個整合檔都有 `@regression` 場景,重跑前一個整合點的關鍵能力。
因為「每次整合都是完整可用的系統」的意思是:**新的能加進來,舊的不能壞**。

## 範式邊界

整合層的規則(DoI、`@regression`、重複移除)在範式來源專案尚未實戰(ADR 0008 §7)。
本 repo 從 I2 起會是第一個踩的,遇到不合理的先記進 ADR 0008 的「整合層修訂」段,
再回饋範式作者,不單方面偏離也不硬套。
