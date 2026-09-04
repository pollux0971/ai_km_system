@i2 @retrieval @phase-2
# 測試 agent 產出,今天預期全紅(GHERKIN_WORKFLOW §6:測試 agent 先寫紅,開發 agent
# 才寫綠)。這份 phase-2 交付把 services/retrieval 接進 apps/api 的 composition root
# ——`apps/api/src/server.ts` 今天完全沒有 retrievalPlugin 的註冊(比對
# conversationPlugin/feedbackPlugin 的條件註冊樣式,retrieval 那一段不存在)。
#
# 每一句步驟都只呼叫今天已經存在的符號:`buildServer()`(apps/api,經
# KmWorld.startServer())、`retrievalPlugin` 會裝上的 `app.retrieval`
# (services/retrieval,今天沒被 server.ts 註冊)、`toRetrievalScope()`
# (phase-1 backfill 已在用的入口)。沒有 import 任何新的實作符號,所以每個
# 場景都紅在斷言,不紅在編譯——`pnpm typecheck` / `pnpm lint` 不受影響。
#
# ADR 0014(2026-09-04)裁定:I2 期間 composition root 用 demo 使用者的固定
# `dept:eng` 當 scope,`retrieve()` 的簽名不變、不在 services/retrieval 內部
# 推導、不建過渡對應表——這個固定值只活在 apps/api 這一層,且是**暫時**的
# 限制,不是「授權已經做完了」。
#
# 每個場景第一條 Then 斷言的都是同一個根因——`app.retrieval` 在真實
# buildServer() 的父實例上根本不存在——它決定了紅的意義(GHERKIN_WORKFLOW
# §5.2)。同一個場景裡在它之後的 Then 今天永遠不會被執行到(cucumber 對失敗
# 步驟之後的步驟一律 skip,不是 fail),等 composition root 真的接上
# retrievalPlugin 之後才會被跑到、變成有意義的斷言。
#
# ⚠️ 寫這份場景時發現的限制(誠實記錄,不是含糊帶過):`retrievalPlugin`
# 沒有指定 `service`/`store` 時,預設會用一個全新的**空**記憶體 store
# (`services/retrieval/src/service.ts:238`)。也就是說,即使 phase-2 用最簡單
# 的方式把 retrievalPlugin 接進 server.ts(比照 conversationPlugin 的條件註冊,
# 不帶任何 options),`app.retrieval` 存在之後,今天也**沒有任何機制**能讓它
# 端出真的索引資料——`05-ingestion/phase-2`(「把 fixture PDF 索引進 dev DB」)
# 是另一個資料夾的工作,而 apps/api 的 composition root 今天沒有任何測試用的
# retrieval store 注入通道(不像 `dbPath`/`migrationsDir` 那樣有 BuildServerOptions
# 覆寫欄位)。因此,下面的場景刻意**不**斷言「能不能真的拿到某部門的 chunk」——
# 那個斷言即使在 phase-2 正確實作之後也不會變綠,寫了就是一個永遠不會有意義
# 的檢查點(GHERKIN_WORKFLOW §5.2:沒有可失敗檢查點的工作項不得標 done,這裡
# 反過來:沒有「可變綠」的路徑的檢查點,一樣不該寫成場景的決定性斷言)。
# 這個缺口記在 FEATURE.md 的「開放問題」,留給協調者判斷是否要在 phase-2 或
# 之後的 phase 補一個測試用的 seed 通道。
Feature: The retrieval seam should be reachable from apps/api's own real server, under I2's temporary fixed scope
  I2 is the first time this system is worth anything to a real person: sign in on the
  web, ask a question about an already-indexed document, read an answer, click a
  citation open to the original text. This phase is the first piece of that: wiring
  `services/retrieval` into `apps/api`'s composition root so the HTTP layer — and the
  `07-generation` plugin that will sit on top of it — has something to call.

  `02-authorization` cannot yet turn a signed-in identity into a real `RetrievalScope`
  (E04-S009 needs `01-identity` to grow department/group ids first). ADR 0014 says I2
  does not wait for that: the composition root hands every signed-in person the SAME
  fixed `dept:eng` scope, on purpose, only inside `apps/api` — never inside
  `services/retrieval` itself, whose `retrieve()` keeps taking a branded `RetrievalScope`
  exactly as it does today. This is a temporary, explicitly-flagged limitation, not a
  claim that authorization is finished.

  Scenario: The retrieval seam has not been wired into the real API server yet
    Given a fresh server with fake providers
    When a signed-in demo person tries to ask "軸承過熱" through the real API server's own retrieval seam
    Then the retrieval seam should be visible from the real server's parent instance, but it is not yet

  Scenario: Once wired, the real server's seam must refuse an empty question instead of silently searching everything
    Given a fresh server with fake providers
    When a signed-in demo person tries to ask "" through the real API server's own retrieval seam
    Then the retrieval seam should be visible from the real server's parent instance, but it is not yet
    And the empty question should be rejected with "RetrievalServiceError", not silently answered

  Scenario: Once wired, the real server's seam must never invent a citation for data that has not been indexed yet
    Given a fresh server with fake providers
    When a signed-in demo person tries to ask "軸承過熱" through the real API server's own retrieval seam
    Then the retrieval seam should be visible from the real server's parent instance, but it is not yet
    And the hits should come back empty, never an invented citation

  Scenario: I2's fixed dept:eng scope is in force — every signed-in person gets the same one, not one derived from their real department (the removal condition lives in 03-conversation/phase-2)
    Given a fresh server with fake providers
    When two different demo people with different real departments each try to ask "軸承過熱" through the real API server's own retrieval seam
    Then the retrieval seam should be visible from the real server's parent instance, but it is not yet
    And both people should get the exact same outcome from the seam, because I2's scope is fixed for everyone alike, not derived from either person's real department
