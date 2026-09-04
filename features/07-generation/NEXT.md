# 07 · generation — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | 無 |
| 進行中 | phase-1(回填,2026-09-04 交付,待 `/phase-done`——嚴格級,須由另一個 session 驗收) |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(`answer()` 從 `app.retrieval` 拿 hits,接進 `apps/api` composition root)** 需要全部滿足:

- [ ] 自身:phase-1 狀態為 `done`
- [ ] 整合:[`06-retrieval`](../06-retrieval/NEXT.md) phase-2 `done`(retrievalPlugin 已註冊進
      `apps/api` composition root)——沒有 `app.retrieval` 就沒有 hits 可拿
- [ ] 整合:I1 已通過(**已滿足**,2026-09-03)
- [ ] 契約:`conversations.yaml` 的訊息是否帶 `citations` 欄位,要先由 `/feature` 分流確認
      (見 [`docs/01-roadmap.md`](../../docs/01-roadmap.md) I2 表格的問號);要新增欄位就是契約放寬,
      屬使用者層級的決定

**phase-3(abstention:沒有來源時回結構化理由)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 契約:E04-S022 的閾值與回應形狀由使用者拍板(產品行為未定義,`docs/DECISIONS_NEEDED.md`)

## Gate 未滿足時

**phase-2 卡在 `06-retrieval` phase-2**:不要在 `services/generation` 裡自己去 new 一個
retrieval service 來「先接起來」——那會在這個資料夾裡長出第二個決定可見性的地方,正是
`service.ts` 檔頭第 3 點禁止的。

gate 未滿足時**可以先做**:

- 把 `rag-composition.test.ts`(真 `retrieve()` → 真 `answer()`,最終引用不含未授權文件)
  寫成 phase-2 的第一個場景(紅),步驟綁到 `app.retrieval` / `app.generation` 兩個接縫。
- 上一項要求跨資料夾共用「seed 一個檢索 store」的句子,那是共用步驟的訊號:寫進本檔與
  `FEATURE.md` 的「待協調」,由協調者搬進 `common.steps.ts`,**不要 import 別的能力資料夾的 steps**。

**不可以先做**:改 `contracts/openapi/*.yaml`、在 `services/generation` 裡加任何 scope 判斷、
把空 context 的自由文字改成結構化 reason code(那是 phase-3 且等使用者)。

## 完成後

phase-2 完成後,I2 只剩 `03-conversation` phase-2(送訊息 → RAG 回答 → 訊息帶 citations)
與 `11-app-shell` phase-2(引用可點)。phase-3 完成後,「查無資料」與「有資料但答不出來」
在 UI 上第一次分得開。
