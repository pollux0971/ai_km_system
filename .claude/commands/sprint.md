---
description: 規劃本週要做哪幾個 phase(ADR 0008)。讀所有 NEXT.md 算出哪些 phase 的 gate 已滿足,標出卡在「契約 gate」的——那是使用者可以立刻解除的阻塞。
---

# /sprint — 規劃本週

指定週(可空):`$ARGUMENTS`

## 第一步:決定週

有值就用它;空的話用今天的 ISO 週(`date +%G-W%V`)。檔案 `docs/sprints/<週>.md`。已存在就問「要重新規劃還是查看?」。

## 第二步:收集狀態

- `docs/roadmap.md` 現況表:目前整合點、回填進度
- 每個 `features/*/FEATURE.md` 的 phase 表(唯一狀態來源)
- 每個 `features/*/NEXT.md` 的三類 gate
- 上一週的 sprint 檔,看哪些沒變成 done
- `docs/adr/` 裡 Status 為 Proposed 的——契約 gate 靠它

## 第三步:計算 ready

對每個 `todo` 的 phase,查它在 `NEXT.md` 的三類 gate:

| Gate | 怎麼查 |
|---|---|
| 自身 | 前一個 phase 的狀態 |
| 整合 | roadmap 現況表,該整合點是否已通過 |
| 契約 | 對應 ADR 是否 Accepted |

三類都滿足 → 實際上是 `ready`,**順手把 FEATURE.md 改成 ready**。有一類沒滿足 → 維持 `todo`,記下卡在哪一類。

## 第四步:WIP 提醒

數 `in-progress`。超過 2 就提醒一次:「目前有 N 個 phase 進行中,建議不超過 2。要先收掉幾個嗎?」
使用者說要繼續就繼續。這是建議不是規則(平行的意思是順序自由,不是同時做十件事)。

## 第五步:挑選

### 回填期間(phase-1 尚未全 done)

回填的 12 個 phase-1 沒有依賴,順序自由。建議:
1. Carry over 優先
2. **在 I2 關鍵路徑上的優先**:05-ingestion、07-generation、04-model-gateway、03-conversation
3. 回填不改實作,可與 I2 的 phase-2 並行(不同 worktree、不同檔案);同一資料夾不同時開兩個 phase
4. 總數 2–4 個

### 整合期間

1. Carry over 優先
2. **目前整合點優先**:只從現況表指的整合點挑。那個整合點的 ready 全挑完才看下一個
3. 依賴鏈優先:被最多其他 phase 依賴的先挑
4. 總數 2–4 個
5. ready 少於 2 個 → 就挑那幾個,並列出「以下 phase 在等什麼」

### 估計

每個 phase 標「小(≤1 天)/ 中(2 天)/ 大(3 天)」。總和超過 5 天就少挑一個。
依據:場景數、`@manual`/`@e2e` 比例、是否碰真模型、是否嚴格級(反向驗證與另開 session 審核要多算半天)。

## 第六步:寫入

`docs/sprints/<週>.md`:

```markdown
# Sprint <週>

## 階段
回填 / I2 / …

## 目標(一句話,從 roadmap 該整合點的「你做得到什麼」改寫)

## 本週 phase
| Phase | 狀態(開始時) | 預估 | 級別 | worktree / agent | 備註 |
|---|---|---|---|---|---|

## Carry over

## @manual / @e2e 場景確認清單
- [ ] …

## 單獨執行檢查
- [ ] `…` 能跑

## Retro(週五填)
- 哪個 phase 比預期難?為什麼?
- 下週要改估法或拆法嗎?
- 有沒有發現契約缺東西?
- 哪個 gate 沒抓到東西?哪條規則多餘?哪條缺?
```

同時:挑中的 phase 在各 FEATURE.md 改 `in-progress`;各 NEXT.md 的「進行中」更新;roadmap 現況表的「目前 sprint」更新。

## 第七步:回報

```
✓ Sprint <週> 已規劃(階段:…)
- 本週:(phase、預估、級別)
- Carry over:…
- 新變為 ready 但沒挑:…
- 仍卡住的 phase 與卡在哪:
    02-authorization/phase-2 — 契約 gate(E04-S009 blocked-team-b)★ 這個使用者可以現在就決定
- 檔案:docs/sprints/<週>.md
```

**卡在契約 gate 的要特別標出來**——那是使用者可以立刻解除的阻塞,不是等待。最後問:「從哪個開始?」

## 禁止事項

- 不挑 gate 未滿足的 phase(除非使用者明確說要)
- 整合期間不跳整合點
- 不改 `.feature` 內容
- 不強迫使用者照建議順序
