# 04 · model-gateway — 下一步

> 這份檔案指揮 agent 何時進行下一個 phase。`/sprint` 會讀它決定 ready。
> 每次 `/phase-done` 之後更新「目前」與「下一步」。

## 目前

| 欄位 | 值 |
|---|---|
| 已完成 | phase-1(2026-09-04,回填,13 場景) |
| 進行中 | 無 |
| 下一個 | phase-2 |

## 下一個 phase 的 gate

**phase-2(在真的 `apps/api` 裡被 06/07 呼叫,兩條路由對真 session)** 需要全部滿足:

- [x] 自身:phase-1 `done`
- [x] 整合:I1 已通過(2026-09-03)
- [ ] 自身:`01-identity` phase-1 `done` —— 路由要對真的 `requireSession` 與 session cookie,
      不是 test harness 的 `x-test-user` header
- [ ] 契約:無新契約需求。`embedding.yaml` / `generation.yaml` 已凍結且路由已對齊,
      phase-2 不動契約;真的要動就是 `/decide` + 使用者

**phase-3(真模型 PF3)** 需要:

- [ ] 自身:phase-2 `done`
- [ ] 契約:`docs/DECISIONS_NEEDED.md` #2(E04-S037 真模型 embedding 與 generation 選型)
      由**使用者**拍板,ADR 0009 由 Proposed 轉 Accepted。**這一條只有使用者能解除。**

**phase-4(ASR 端到端)** 需要:

- [ ] 自身:phase-1 `done`(已)
- [ ] 環境:目標機器上依 `models/asr/README.md` 建好 whisper.cpp 的 `whisper-server`
      並下載模型檔,直到 `pnpm --filter @ai-km/tool-asr-readiness check-asr` exit 0。
      **本機實測 2026-09-04:exit 1**(`whisper-server:未找到`、`模型檔:未找到`;
      GPU 有 —— GTX 1650 / 4096 MiB,建議量化 q5_0)。
- [ ] 素材:`tools/asr-readiness/fixtures/sample-zh-en.wav`(真錄音,未進版控)

## Gate 未滿足時

**phase-2 卡在 `01-identity`**:不要為了先接而在 `apps/api` 造一個假的 session。可以先做的是
`apps/api/src/server.ts` 目前 **沒有**把 `embedding` / `generation` 契約載入時的行為寫成場景
——`modelGatewayPlugin` 是無條件註冊的,但兩條路由靠 `hostSpecNames(app)` 決定要不要掛。
用真的 `buildServer()` 起一個 server、檢查 `app.modelGateway` 對 sibling 可見、
以及 `POST /v1/embeddings` 在契約已載入時不是 404 —— 這一條不需要真 session(未登入是 401,
401 ≠ 404 就足以證明路由掛上了),可以先寫。

**phase-3 等使用者**:在 #2 拍板之前,**不要**寫任何 `@model` 場景,也不要為了「先驗一下」
把 `HttpEmbeddingProvider` 指向某個隨手起的 server —— 那會變成一份沒人批准的模型選型既成事實。
可以先做的:把 `HttpEmbeddingProvider` 對「契約驗證過的假 server」的 PF2 場景寫好(紅),
它不需要選型結果,只需要 `embedding.yaml`。

**phase-4 等環境**:不要用 `FakeTranscriptionProvider` 冒充 ASR 驗證(E12-S030 的
Anti-hallucination Guard 明寫禁止)。可以先做的:把 `verify-asr` 的關鍵字命中率與
「全是正體中文」兩個判準寫成 phase-4 的場景(紅),等機器就緒直接跑。

## 完成後

phase-2 完成即解除 `06-retrieval` phase-2 與 `07-generation` phase-2 對「真的 embed/generate
從哪裡來」的依賴 —— 那是 I2 的地基。phase-3 完成才第一次有資格談答案品質;
在那之前任何關於語意召回、同義詞、跨語言檢索的斷言都不成立(PF1 只看得到字面重疊)。
