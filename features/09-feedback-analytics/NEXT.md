# 09 · feedback-analytics — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填,14 場景) |
| 進行中 | 無 |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(回饋掛在真 RAG 答案上)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [ ] 整合:I2 通過(web 提問要能產生真的 assistant 答案,才有東西可以按 NG)
- [ ] 自身:`07-generation` phase-2 `done`(答案由 `answer()` 產生並帶引用)
- [ ] 契約:`questionsAsked` 是否要跟 `date` 同一個時間範圍——需要一個 ADR
      (見 `FEATURE.md` 的開放問題;現況是明示決定,不是缺陷,但會誤導看儀表板的人)

**phase-3(admin 畫面的人眼驗收)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 整合:I5 排進 roadmap
- [ ] 協調:`10-admin-console` 的瀏覽器場景基礎設施(本資料夾不自己加 jsdom/playwright 依賴)

## Gate 未滿足時

**phase-2 卡在 I2**:不要為了先做而把假的 RAG 答案寫進場景——phase-1 已經用直接建立的
assistant 訊息覆蓋了「按 NG + 選原因」的機制,再做一次假的只會重複。這段期間可以先做的:

- 把 `FEATURE.md` 開放問題第二條(`questionsAsked` 的時間範圍)走 `/decide` 寫成
  ADR `proposed`,讓使用者一句話就能解除這個 gate。
- 把 roadmap I5 段裡那條已經不成立的「admin 原樣渲染 `INCORRECT`」交給協調者劃掉
  (`docs/` 是共用檔,本資料夾不改)。

**不可以先做的**:改 `contracts/openapi/analytics.yaml`(新增聚合端點、放寬欄位)。
現在沒有「整體 OK/NG 比率」的聚合端點,`apps/admin` 的比率因此只是**當頁**統計;
要修它就是新 endpoint = 契約放寬 = 使用者拍板(CLAUDE.md 決策權表)。

## 完成後

phase-2 完成即讓 I5「對答案按 OK/NG 並選原因,管理員看到真實聚合」剩下純畫面的部分;
phase-3 完成後 I5 可以交給使用者親手驗收。
