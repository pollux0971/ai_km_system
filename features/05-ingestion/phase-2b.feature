@i2 @ingestion @phase-2b
# 測試 agent 產出,今天預期紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。規格來源(照順序):
#   1. features/05-ingestion/FEATURE.md「為什麼有 phase-2b」——I2 五塊全 done、
#      整合場景 28/28 綠,但 `pnpm dev` 起來、在瀏覽器問問題時檢索 store 是空的,
#      因為 `ingestionPlugin` 沒有路由、`tools/` 沒有 CLI,`app.ingestion` 只有
#      行程內碰得到(§5.4 的字面案例)。
#   2. features/05-ingestion/NEXT.md「phase-2b 的 gate」——顧問裁決:方向是
#      「旗標 seeder」(`AI_KM_DEV_SEED_FIXTURE`),seeder 必須走與測試步驟同一條
#      `app.ingestion` 路徑,不另開程式碼路徑;啟動時 log 印出索引了哪份文件、
#      幾個 chunk;`NODE_ENV=production` 加旗標 → 拒絕啟動。
#   3. docs/adr/0015-*.md 的 D3′——`app.ingestion` 是 on-demand 接縫,不掛任何
#      自動 seeder(登入/開機觸發的自動 seed 會讓「第二個 server 是空的」這個
#      D4 的斷言變假)。本檔的場景 (b) 就是保住這條理由不變假的守門——旗標關掉
#      (預設)時,store 必須真的是空的,不能有任何隱性的自動 seed。
#
# 三個場景都只呼叫今天已經存在的符號:`loadConfig()`、`buildServer()`
# (apps/api,composition root 早就把 `app.retrieval`/`app.ingestion` 接上,
# 05-ingestion/phase-2 已 done)、`RetrievalService.retrieve()`。沒有 import
# 任何新符號、沒有假設 `AI_KM_DEV_SEED_FIXTURE` 這個環境變數今天存在——
# `loadConfig()` 對未知的環境變數本來就安靜忽略,`buildServer()` 今天不會因為
# 任何環境變數去索引 fixture PDF。所以每個場景紅在斷言,不紅在編譯
# (pnpm typecheck 不受影響)。
#
# 場景 (a) 的已知值——**不是自己算的**:fixture PDF
# `services/ingestion/src/extraction/fixtures/cjk-non-embedded.pdf` 用預設 chunk
# 設定(`targetSize: 480`,`services/ingestion/src/chunking/chunk.ts`)切出的
# chunk 數,2026-09-05 用同一條生產路徑(`createIngestionService().ingest()`,
# 與 `services/ingestion/src/pipeline.test.ts` W1-00 同一顆 deterministic
# embedding provider)重新跑一次量出來的實測值是 **1**——186 個字元 < 480,
# FEATURE.md「開放問題」已經記過這個數字,這裡只是拿量出來的值當斷言,不是
# 讀 targetSize/字元數自己推算(GHERKIN_WORKFLOW §5.3「機制要用量的,不要用讀的」)。
#
# 本檔刻意不帶 `@standalone`:三個場景全紅或部分紅,掛上會讓已經綠的單獨執行
# gate 當場變紅——等 phase-2b 真的綠了,協調者再補上 tag(比照 phase-2.feature
# 的先例)。
Feature: `pnpm dev` starting the server with an explicit flag indexes the fixture PDF, without opening a second, silent seeding mechanism
  Before this phase, `app.ingestion` only exists as an in-process seam a cucumber
  step or a vitest test can reach directly — there is no route, no CLI, and no
  flag that puts a document into the store a real `pnpm dev` server hands to
  `app.retrieval`. A developer who starts the server the ordinary way and asks a
  question in the browser gets nothing, even though every automated check is
  green, because none of those checks go through the one entry point a person
  actually uses (main.ts → buildServer() → listen()).

  This phase adds exactly one new entry point: an explicit flag a developer
  passes at boot. Turning it on indexes the same fixture PDF I1 already proved
  end to end, through the SAME `app.ingestion.ingest()` call every other
  scenario in this capability uses — not a second, parallel way of writing into
  the store. Leaving it off, the default, must still leave the store empty:
  that emptiness is what makes ADR 0015's decision to keep `app.ingestion`
  on-demand (rather than an automatic, login-triggered seeder) a true statement
  instead of a false one nobody re-checks.

  Scenario: Turning the fixture-seeding flag on before boot puts the same number of chunks in the store that I1's own end-to-end pipeline test already proved
    Given a developer starts the API server with the fixture-seeding flag turned on
    Then asking the server how many chunks of the fixture are indexed finds exactly 1, the same count I1's own end-to-end pipeline test produces for this fixture

  Scenario: Leaving the fixture-seeding flag off — the default a real deployment would use — keeps the store empty
    Given a developer starts the API server the ordinary way, without the fixture-seeding flag
    Then asking the server how many chunks of the fixture are indexed finds none, because only an explicit flag may put fixture data into a store a real deployment also uses

  Scenario: Turning the fixture-seeding flag on in a production environment is refused before the server starts, not silently ignored
    When a developer tries to start the API server with NODE_ENV=production and the fixture-seeding flag turned on
    Then starting the server is rejected before it can listen on any port
    And the rejection message names "AI_KM_DEV_SEED_FIXTURE" as the reason
