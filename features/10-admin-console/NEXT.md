# 10 · admin-console — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | 無(phase-1 待 `/phase-done`) |
| 進行中 | phase-1(回填,2026-09-04 交出) |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(頁面層:元件渲染、`AdminRouteGuard` 實際擋人、導覽與授權表對齊)** 需要全部滿足:

- [ ] 自身:phase-1 `done`(嚴格級,`/phase-done` 由**另一個 session** 跑)
- [ ] 整合:無(不必等 I2;這個資料夾的後端接縫已經在 `apps/api` 裡)
- [ ] 契約:無
- [ ] 環境:features 的 cucumber runner 要有瀏覽器環境。目前是 **node + tsx,沒有 jsdom**,
      所以 53 個 `apps/admin/**/*.test.tsx` 走的那條路在 cucumber 這一層跑不起來。
      **不要自己加依賴**——這是 `features/package.json` 的變更,屬協調者。
- [ ] 共用檔:`features/tsconfig.json` 的 `lib` 加上 `"DOM"`(FEATURE.md 待協調第 1 條)。
      不是硬 gate(現在用動態 import 繞過去了),但加了才能把那段繞路換回普通 import。

**phase-3(部門／群組接真後端)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I6(admin 管部門群組)排進來
- [ ] 契約:**使用者裁決** —— `contracts/` 目前沒有 department/group schema。
      新增 schema 屬「契約放寬」,依 CLAUDE.md 決策權表要使用者拍板。
      在那之前不得自行新增 yaml,也不得在 `apps/api` 造一條沒有契約的路由。

## Gate 未滿足時

**phase-2 卡在瀏覽器環境**:不要為了讓元件場景跑起來自己裝 jsdom。可以先做的兩件事,
兩件都不需要瀏覽器:

1. **導覽與授權表對齊**——「`ADMIN_NAV_GROUPS` 裡每一個 href 都在 `ADMIN_ROUTES` 裡有條目」。
   這正是 E11-S026 補 `/latency` 時暴露的歷史缺口的**性質版**守門(坑 1:守不變量,不守數字),
   而且既有測試沒有這一條——所以它不屬於 phase-1 回填,是 phase-2 的新場景。純 node 跑得動。
2. **連接器開關的來回**——`enableConnector` / `disableConnector` 在 node 底下是 no-op 寫入
   (`typeof window === "undefined"` 就不寫),所以只能驗「找不到的連接器被拒(`NOT_FOUND`)」
   這一半;要驗「開了之後真的是 enabled」需要 storage,那是 phase-2 的事。

**phase-3 卡在使用者**:不要先造一個過渡的 department/group 對應表。把需求寫進
`docs/DECISIONS_NEEDED.md` 一列(「admin 管部門群組要不要真的落庫、跨部門搬人合不合法」),
繼續做別的資料夾。

## 完成後

phase-2 完成即補上 I6(admin 管部門群組)所需的前端半邊;真正解鎖 I6 還要
`02-authorization` 能把部門／群組變成真的 `RetrievalScope`(E04-S009),
以及 phase-3 的契約裁決。
