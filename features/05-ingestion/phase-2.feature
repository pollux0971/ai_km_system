@i2 @ingestion @phase-2
# 測試 agent 產出,今天預期全紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。規格來源是 `docs/adr/0015-composition-root-owns-the-retrieval-store.md`
# (2026-09-05,協調者裁決)。這份 phase-2 交付把「一份索引好的 PDF」接到「apps/api
# 真實 buildServer() 上的檢索」——今天這兩件事完全不通:
#
# - `apps/api/src/server.ts` 沒有 import `ingestionPlugin`,`app.ingestion` 在真實
#   composition root 上完全不存在(比對 `retrievalPlugin` 已經在同一個檔案第 294 行
#   被無條件註冊——06-retrieval/phase-2 已經 done,`app.retrieval` 今天真的可見)。
# - 就算 `app.ingestion` 存在,`retrievalPlugin` 沒被指定 `service`/`store` 時,
#   會在自己的 default 那行(`service.ts:238`)建一個全新的空 in-memory store——
#   composition root 今天沒有任何機制讓「索引」與「檢索」共用同一個 store 實例。
#   ADR 0015 決策 1 要composition root 自己持有 store、建自己的 `RetrievalService`
#   再把 `{ service }` 交給 `retrievalPlugin`;決策 3 要用既有的
#   `registerSandboxSeeder` 樣式(`apps/api/src/server.ts` 的
#   `ensureSandboxSeederRegistered`)把 fixture PDF 灌進那個共用 store,不開第四種
#   機制。
#
# 每一句步驟都只呼叫今天已經存在的符號:`buildServer()`(apps/api)、
# `toRetrievalScope()`(phase-1 已在用)、`retrievalPlugin` 裝的 `app.retrieval`
# (今天存在但永遠是空的)。沒有 import 任何新的實作符號,所以每個場景都紅在斷言,
# 不紅在編譯——`pnpm typecheck` / `pnpm lint` 不受影響。
#
# ⚠️ 誠實記錄,不是含糊帶過的三個限制:
#
# 1. 「索引」的步驟(下面「the real Chinese fixture PDF is indexed into the real
#    API server's own store...」)今天只做一件事:檢查 `app.ingestion` 存不存在,
#    記下來,然後什麼都不做——因為它今天真的不存在。等 composition root 真的接上
#    `ingestionPlugin` 並與 `app.retrieval` 共用 store 之後,這句話才會真的把
#    fixture PDF 寫進去,後面依賴它的斷言才會第一次被真正執行到。
# 2. D2(embedding 版本守門)那個場景**無法在今天用真資料驗證**「index 時的
#    embedding 身分與現在的 query 身分不同」這件事——因為連 index 都還沒有落點,
#    更沒有辦法控制「index 當時用的是哪個版本的 embedding provider」。這個場景的
#    Given 步驟因此也是「檢查存在、記下來、不做事」,它要驗證的性質留在場景本文
#    (D2 的第二條 Then),等 composition root 接上之後才會被真的跑到並賦予意義——
#    這正是本 phase 的**嚴格級**理由:一旦接上,`enforceEmbeddingVersion` 被
#    composition root 忘記打開,就是「靜默給出錯誤結果」(GHERKIN_WORKFLOW
#    §5.1),反向驗證要打在 composition root 那一行,不是打在
#    `services/retrieval` 自己的守門邏輯上——那部分邏輯已經是 06-retrieval 自己
#    的範圍與既有測試(`plugin.test.ts` AC-RS5、`retrieval.steps.ts` 的
#    embedding-identity 場景),本 phase 不重複驗證,只驗證 composition root 真的
#    把開關打開這件事本身。
# 3. D4(in-memory 限重開就沒了)的場景用「另外獨立啟動第二個 `buildServer()`」
#    當「重開」的替身,不是真的 kill process——同一個測試 process 裡兩個獨立的
#    `buildServer()` 呼叫,各自的 retrieval store 互不相通,足以證明「不會跨
#    process 存活」這個性質,場景本文照實這樣寫,不假裝是真的重開機。
#
# D3(用既有 `registerSandboxSeeder` 樣式,不開第四種機制)與 D5(這個 phase 不碰
# sqlite-vec、持久化留給 06-retrieval/phase-3)是**實作路徑**的約束,不是可觀察的
# 行為,所以不各自開一個場景——它們的落點是這份檔頭與 FEATURE.md,實作是否遵守由
# `/phase-done` 的 diff 審查與 ADR 0015 本身守。
#
# 本檔刻意**不**帶 `@standalone` tag:`standalone.json` 的 `05-ingestion` key
# 今天跑 `--tags '@ingestion and @standalone and not @manual'` 且斷言剛好
# `10 scenarios (10 passed)`(全部來自 phase-1)。這份 phase-2 今天是紅的,
# 掛上 `@standalone` 會讓那個已經綠的單獨執行 gate 當場變紅,而那不是這份 phase
# 自己的驗收範圍——`/phase-done` 通過、phase-2 真的綠了之後,協調者再把
# `@standalone` 補上、connect 更新 FEATURE.md 的「單獨執行」段落。
Feature: A fixture PDF indexed at boot is queryable through the real API server's own retrieval seam — not a second, invisible store
  05-ingestion's job is to give I2 something to ask a question about. Before this
  phase, indexing a document and asking the real API server about it are two
  unrelated things: nothing in `apps/api` writes into the store
  `app.retrieval` reads from, so a "successfully indexed" document is
  unreachable from the one seam a real user's question actually goes through.

  This phase wires a fixture PDF into the SAME store the composition root hands
  to `retrievalPlugin`, using the existing sandbox-seeder pattern
  (`01-identity`/`03-conversation` already use it) rather than a new, parallel
  mechanism — and states plainly, in the scenarios themselves, that this store
  is still in-memory and does not survive past one process. Persisting it is
  `06-retrieval/phase-3`'s job, not this one's.

  Background:
    Given a fresh server with fake providers

  Scenario: The ingestion seam has not been wired into the real API server yet
    When the real Chinese fixture PDF is indexed into the real API server's own store under department "eng"
    Then the ingestion seam should be visible from the real server's parent instance, but it is not yet

  Scenario: Once wired, indexing the fixture PDF at boot and asking about it through the real server's own retrieval seam must find the very same chunk — not come back empty because indexing wrote into a different store than the one being queried
    When the real Chinese fixture PDF is indexed into the real API server's own store under department "eng"
    And a signed-in demo person tries to ask "知識管理系統設計文件" through the real API server's own retrieval seam
    Then the ingestion seam should be visible from the real server's parent instance, but it is not yet
    And the answer should include the chunk that was just indexed, not come back empty because indexing and querying used two different stores

  Scenario: A chunk indexed under a different embedding identity than the one currently configured must be refused, not silently ranked as if it matched
    When the real Chinese fixture PDF is indexed into the real API server's own store under department "eng", back when a different embedding model was configured
    And a signed-in demo person tries to ask "知識管理系統設計文件" through the real API server's own retrieval seam
    Then the ingestion seam should be visible from the real server's parent instance, but it is not yet
    And asking should be refused with "EmbeddingVersionMismatchError", not silently answered using a chunk indexed under a stale embedding identity

  Scenario: What gets indexed by one server instance does not survive to a second, independently started one — the in-memory limitation stated here, not left to a comment
    When the real Chinese fixture PDF is indexed into the real API server's own store under department "eng"
    And a second, independently started real API server is asked "知識管理系統設計文件" through its own retrieval seam, standing in for the same server restarting
    Then the ingestion seam should be visible from the real server's parent instance, but it is not yet
    And the second server's answer should come back empty, because the in-memory store does not survive past one process — 06-retrieval/phase-3 is what will make it persistent
