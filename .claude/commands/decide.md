---
description: 記錄一個技術或設計決策到 docs/adr/(ADR 0008)。任何有取捨的選擇——含 agent 自己在實作中做的——都用它。先評估會不會動到契約。
---

# /decide — 記錄決策

描述:

> $ARGUMENTS

## 第一步:讀取

- `docs/adr/` 全部,記下最大編號(目前 0008)
- `contracts/openapi/*.yaml` 相關的那份——判斷這個決策會不會動到契約
- 相關的 `FEATURE.md` 與 `NEXT.md`
- `docs/stories/PENDING_DECISIONS.md`(唯讀歷史)裡有沒有同一件事已經問過

## 第二步:契約影響評估(先做,它會改變後面的所有事)

**軟約定**(service 之間的 in-process 函式簽章、記憶體介面、預設值)→ **不需要 ADR**。
告訴使用者「這只需要跑測試、更新 FEATURE.md、commit 說明理由」,然後問還要不要記。多數情況不用。

**硬約定**(`contracts/openapi/*.yaml` 的 schema、endpoint、permission、error code;DB migration;
Fastify plugin 註冊拓樸)→ 需要 ADR,而且:
1. 明確指出要改哪份 yaml 哪個 schema、或哪個 migration
2. 列出**需要重驗的 phase**:已 done 且使用該契約的、in-progress 的、受影響的整合點;compat gate / L2-EQ / binding coverage 會在哪裡紅
3. 提醒:已產生的資料(SQLite、向量庫)可能要遷移——這通常才是真成本
4. **狀態 Proposed,等使用者拍板**。鐵律 #1:改契約是使用者的事。

## 第三步:補齊資訊

五欄位,從描述能推出多少填多少,**不足的一次問完**:Context、Decision(要能直接照做)、Alternatives(為什麼沒選)、
Consequences(好處與代價、影響哪些能力)、Related(ADR、契約、features 資料夾)。
使用者只給一句話時,主動補 Context 與 Alternatives 的草稿讓他確認,不要五個都問。

## 第四步:衝突檢查

逐一比對所有 Accepted ADR 的 Decision:
- **推翻**:直接矛盾 → 新 ADR 標 `Accepted · supersedes ADR NNNN`;舊的 Status 改 `Superseded by ADR NNNN`;舊內容**不刪**
- **修正**:改了參數不改方向 → 新 ADR 的 Related 寫「修正 ADR NNNN」,舊的不動
- **無關**:正常新增
推翻時明確問「這會推翻 ADR NNNN(標題),確定嗎?」等確認。

## 第五步:寫入

`docs/adr/NNNN-<slug>.md`,照 `docs/adr/0000-template.md` 的欄位(Status / Context / Decision / Consequences),
補 Alternatives 與 Related 兩段。Status:`Accepted · <日期>` 或 `Proposed(待使用者)`。

## 第六步:連動

- 動了契約 → 列重驗清單;受影響的已 done phase 狀態改回 `in-progress` 並在 NEXT.md 註明原因
- 改變某能力的技術棧 → 提示更新該 FEATURE.md
- 改變某 phase 的 gate → 更新該 NEXT.md 的契約 gate 指向此 ADR
- 讓某些 `.feature` 場景不再正確 → 列出受影響場景,提示用 `/feature` 處理

## 第七步:回報

```
✓ ADR NNNN 已記錄:<標題>(Status: …)
- 契約影響:無 / <yaml.schema>,需重驗:…
- 推翻 / 修正 / 無關:…
- 連動提示:…
```

## 禁止事項

- 不刪除任何 ADR;不修改既有 ADR 的 Context / Decision / Alternatives / Consequences(只能改 Status)
- ADR 編號只增不重用
- 不在未評估契約影響前寫入
- 硬約定不在使用者拍板前標 Accepted
