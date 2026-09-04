# Task 2 — 定義性 E2E 基準線（兩輪連跑，clean main）

依 ai-km-e4 指示（2026-08-29），在整批次收尾前對 clean main 跑一次定義性
E2E 基準線：單次持鎖、兩輪連跑，藉此關閉 E03-S038 AC1「連跑 2 輪無新
flaky」的缺口，同時作為最終收尾報告的基準數字。本檔案是這次量測的完整
記錄，不屬於任何單一 story 的允許修改清單。

## 前置條件確認

- E03-S039（跨視窗同步 client）已 merge（`b90a57b`）。
- E04-S057（E2E lock guard）已 merge（含 `5b865ec` 的 flock-authoritative
  修正）。
- E01-S022、E03-S047 皆已 `approved`。

## 執行細節

- **main commit**：`e79dc90`（`docs(E03-S047): honesty amendment + unverified lead, from ai-km-a4's independent review`）
- **鎖**：單次持鎖，使用 E04-S057 提供的共用 wrapper
  `/data/python/AI_KM-worktrees/e2e-locked.sh "ai-km-83-task2-baseline-v2"`，
  兩輪皆在同一次持鎖內完成。

### 🔴 執行過程中發現的 E04-S057 缺口（已回報 ai-km-e4，本檔記錄過程）

第一次嘗試（`ai-km-83-task2-baseline`，未帶工作繞過）用 `pnpm exec turbo
run test --force` 直接跑，**在 round 1 module-eval 階段就被本次執行自己
持有的鎖擋下**：

```
Error: [E04-S057] Refusing to start Playwright: the shared E2E lock
(/data/python/AI_KM-worktrees/.e2e.lock) is currently held, most likely by
ai-km-83-task2-baseline pid=1659087 2026-08-29T09:43:26+08:00, and this
process is not them. ...
```

查證根因：`pnpm exec turbo run test --force --dry=json` 顯示
`"envMode": "strict"`、`"specified": {"env": []}`——`turbo.json` 沒有宣告
任何要透傳的環境變數，turbo 2.10.9 的 strict env mode 因此把
`e2e-locked.sh` export 的 `AI_KM_E2E_LOCK_TOKEN` 從 `@ai-km/e2e#test` 這個
子行程的環境剝除，導致 `lock-guard.ts` 看不到 token、認不出持鎖者就是
自己。**這代表 AC1 字面指令 `pnpm test` 目前無法在鎖被 `e2e-locked.sh`
持有時通過 guard——這正是 guard 存在的唯一目的**，是 E04-S057 一個真實、
先前未被涵蓋到的缺口（該 story 的 AC1/AC5 驗證用的是直接
`playwright test --list`，沒有經過 turbo 這一層）。已即時回報
`ai-km-e4`；修法推測是在 `turbo.json` 幫 `test` task 宣告
`"env": ["AI_KM_E2E_LOCK_TOKEN"]`，但不屬於本次量測任務範圍，未擅自修改
`turbo.json`。

**繞過方式**（僅為了完成本次量測，非永久修法）：兩輪皆拆成兩段——
`pnpm exec turbo run test --filter='!@ai-km/e2e' --force`（涵蓋除
`@ai-km/e2e` 外全部 package 的 typecheck/lint/unit，不受 token 剝除影響）
+ `(cd tests/e2e && pnpm exec playwright test)`（直接呼叫，跳過 turbo，
繼承同一個 shell 的環境，`AI_KM_E2E_LOCK_TOKEN` 正常可見）。

## 結果

### 非 E2E（typecheck/lint/unit，全部 package 除 `@ai-km/e2e`）

兩輪皆 **32/32 tasks successful**，`@ai-km/web` unit 1801/1801（兩輪逐字
相同）。

### E2E（`playwright test`，3 個 project：`web`/`setup`/`admin`）

| | 開始 load avg | 中段 load avg（非 E2E 結束／E2E 開始） | 結束 load avg | 結果 |
|---|---|---|---|---|
| **Round 1** | 6.09 (09:48:20) | 17.87 (09:50:18) | 9.47 (09:57:21) | **331 passed, 0 failed（331 total，約 7.0m）** |
| **Round 2** | 9.47 (09:57:21) | 16.08 (09:59:13) | 10.06 (10:05:47) | **330 passed, 1 failed（331 total，約 6.6m）** |

（`uptime` 1-分鐘平均值；本次量測全程機器相對安靜，未見任何一輪超過
18 的尖峰，與統一驗證那次 load 26.61 的高負載狀態不同。）

**明確聲明分母**：331 = `web` project 全部既有 spec + `setup` project（1
個 auth 暖機測試）+ `admin` project 全部既有 spec，三個 project 合計，
`playwright.config.ts` 目前定義的全部 project、無任何 `--project`/`--grep`
過濾。這是目前 main 這個 commit 下 `tests/e2e/specs/*.spec.ts` 的完整既有
集合（不含本次不存在的任何新增/skip）。與同一天稍早 `ai-km-f9` 的
256/256、`ai-km-2c` 的 328/330 對不上：**分母差異已由 `ai-km-aa` 獨立審核
E03-S039 時查證**——`ai-km-f9` 的 256/256 是 `--project=web` 單一
project（該 story 不碰 apps/admin，範圍選擇合理，非稀釋分母）；跟
`ai-km-2c`/本次的三 project 合計（web+setup+admin）本來就不是同一個
分母，不需要用「測試總數自然成長」解釋。本次仍是目前唯一一次在同一個
commit 上連續兩輪、且明確記錄三 project 全涵蓋範圍的量測，可作為最終
基準線引用。

### Round 2 的 1 個新失敗

```
[web] › specs/send-message.spec.ts:60:5 › E03-S009: sending a message
updates the conversation list's preview

Error: expect(locator).toBeVisible() failed
Locator: getByRole('main').getByText('這則會成為新的預覽文字')
Timeout: 5000ms
Error: element(s) not found
```

Round 2 的 webServer log 在這次失敗前後出現：

```
[Error: aborted] { code: 'ECONNRESET' }
uncaughtException: [Error: aborted] { code: 'ECONNRESET' }
```

**分類（不做重複的隔離重跑，直接引用既有更充分的獨立調查）**：這個訊息
簽章（`element(s) not found`/5000ms timeout + 伴隨 `ECONNRESET` webServer
雜訊）與 `docs/stories/E03-S047.md`「誠實修正（獨立審核後追加）」段落
記錄的並發執行 flaky **逐字相同**。`ai-km-a4` 在本次量測之後、拿到本檔
初稿前，已針對「是否與 E03-S039 的 SSE 連線洩漏修正有關」這個假說做過
更充分的驗證（本人於 2026-08-29 直接回報）：`send-message.spec.ts
--repeat-each=3` 三輪、共 36 個實例，涵蓋 E03-S039 SSE 修正**前後各一半**
，同樣的斷言／同樣的 locator／同樣的 `element(s) not found` 5000ms
timeout 簽章在修正前後都會出現——**已排除與 E03-S039 的因果關係**，判定
為既有的、與本次量測無關的併發執行 flaky。因為 ai-km-a4 的樣本（36）遠
大於本次原本要排的隔離重跑（3），本次不重複跑，直接引用其結論；筆者
原本排的 `send-message.spec.ts --repeat-each=3` 已取消，未消耗鎖時間
（`.e2e.owner` 顯示鎖從未被那次排程取得）。

**結論**：Round 2 這 1 個失敗**不是新回歸、也不是 E03-S039 造成的新
flaky**，是既有已被獨立追蹤、與本次任何變動皆無關的並發競爭型 flaky
（`fullyParallel` 下同檔案多測試併發送出多個 SSE 訂閱時偶發）。

## AC1 結論（E03-S038）

Spec 原文（`E03-S038.spec.md` 第 71-72 行）：「連跑 2 輪無新 flaky
（既有已記錄的資源競爭型 flaky 需獨立隔離重跑證明非回歸）」。

- **連跑 2 輪**：達成（本檔記錄的單次持鎖兩輪連跑）。
- **無新 flaky**：round 2 唯一的失敗經核對是**既有**（E03-S047 EVIDENCE
  已記錄在案）、**已由更充分樣本獨立隔離重跑證明非回歸**（ai-km-a4 的
  36 實例調查）的資源競爭型 flaky，不是本次量測或任何近期 story 新產生
  的。
- **AC1 現在真正達成**，不是靠詮釋或引用單輪統一驗證帶過。

## 本次量測的已知限制（誠實記錄）

- E2E 部分繞過了 turbo（見上方缺口說明），不是字面的單一指令
  `pnpm test`——但涵蓋範圍與字面指令完全相同（同一組 package、同一組
  test script），只是分成兩個行程呼叫。
- 非 E2E 部分兩輪皆為 `--force`（bypass turbo cache），保證真的重新
  執行，不是回放快取結果。
