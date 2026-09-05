@integration @i2
Feature: A person asks a question in the web app and gets an answer whose citations open the original passage
  I2 is the first time the experience layer talks to the data layer. Until now
  apps/web answered from mocks and the RAG pipeline answered only tests. After
  I2 a person logs in, asks a question about a document that was ingested by
  the I1 pipeline, reads an answer produced through the model gateway, and
  clicks a citation that opens the exact original passage the offsets select.

  The model may still be fake (PF1) — the answer text will be canned. What I2
  proves is that the seam apps/web → apps/api → retrieval → generation →
  citations → UI exists end to end. Scope is FIXED to dept:eng for I2
  (ADR 0014); deriving it from the signed-in identity is I3.

  2026-09-05 — this paragraph used to end "and fails closed on scope", and two
  scenarios below asserted that. They could not pass: ADR 0014 (written to
  UNBLOCK I2) fixes every caller's scope to dept:eng, and 03-conversation's
  phase-2.feature asserts that same fixed scope. Two specs said opposite things
  about one behaviour, and this integration file was the first place they ran
  together — five phase-done runs each went green without noticing. The two
  scenarios moved (see below); a header must not claim something the file does
  not prove.

  Background:
    Given a fresh server with fake providers
    And the real Chinese fixture PDF is ingested under department "eng"
    And the demo user belongs to department "eng"

  @e2e @manual
  Scenario: A person asks in the browser and opens the cited passage
    Given the person is logged in as the demo user in apps/web
    When the person asks "文件擷取管線包含幾個階段？" in a new conversation
    Then an answer appears with at least one citation
    And clicking the first citation shows "剖析、切塊、嵌入與儲存"
    And the person confirms the highlighted passage is the one the answer relied on

  Scenario: The API answers with citations that slice the stored original text
    When the demo user posts the question "文件擷取管線包含幾個階段？" to a new conversation
    Then the response status is 201
    And the answer carries at least one citation
    And every citation's text equals the original text sliced by its offsets
    And no citation belongs to a document outside department "eng"

  # MOVED 2026-09-05 → features/04-model-gateway/phase-3.feature (real-model PF3).
  # The wording there is "rather than an UNRELATED one", not "invented": generation's
  # fabricated-citation guard works — the citation really is in context. The problem is
  # 答非所問, citing a real but irrelevant document, because retrieve() has no similarity
  # threshold. The advisor ruled 2026-09-05 that adding a threshold NOW would be fake
  # tuning: today's embedding is feature hashing (deterministic.provider.ts's own header),
  # so its scores carry no semantics and any value calibrated against them dies with the
  # real model. Mechanism + value land together in 04-model-gateway/phase-3.
  Scenario: During I2 an off-topic question still gets a citation — fake embeddings carry no relevance; this turns red when the real-model threshold lands, then moves
    When the demo user posts the question "這份文件裡沒有的主題" to a new conversation
    Then the response status is 201
    And the answer carries at least one citation from document "i2-doc-eng"

  # MOVED 2026-09-05 → docs/integration/i3-scope-from-identity.feature, verbatim.
  # "A person outside the department gets nothing" is I3's definition ("部門授權真的
  # 來自身分"), not I2's. Replaced here by the scenario below, which asserts what I2
  # ACTUALLY does — and whose asserted VALUE changes the day I3 derives scope from
  # identity. That is what makes it a real removal condition, unlike 06/07's scenario 4
  # (see ADR 0014's "這份 ADR 的一個空保證").
  Scenario: During I2 every signed-in person gets the fixed eng scope (ADR 0014) — turns red when I3 derives scope from identity, then moves
    Given the demo user belongs to department "hr"
    When the demo user posts the question "文件擷取管線包含幾個階段？" to a new conversation
    Then the response status is 201
    And the answer carries at least one citation from document "i2-doc-eng"

  @regression
  Scenario: I1 still holds — citation offsets slice the stored original text exactly
    When a person in department "eng" asks "文件擷取管線包含幾個階段？"
    Then the top hit's text equals the original text sliced by its offsets
    And the top hit's score is greater than 0

  # ADDED 2026-09-05 (/feature, 顧問 ai-km-1b 確認)。**這條是這個檔案裡唯一走「人走的入口」
  # 的自動場景。** 其餘 5 條(以及五個 phase 的 phase-done、以及 28 條 @i2 場景)全部在
  # 同一個 process 裡自己 buildServer()、自己索引、自己問——所以它們全綠的時候,
  # 「一個人開瀏覽器問問題」仍然可能完全做不到,而且沒有任何一層會發現。
  # 2026-09-05 就是這樣:五個 phase 綠、整合 28/28 綠,而 dev server 的檢索 store 是空的
  # (app.ingestion 沒有路由、沒有 CLI,只有行程內接縫碰得到)。
  # 這條今天會紅,05-ingestion/phase-2b 落地後綠——**它就是那個缺口的反向驗證**。
  #
  # 2026-09-05 更正:旗標值原本寫 `=1`,測試 agent 實測指出 `apps/api/src/config.ts` 的
  # `readBoolean()` **只接受 "true"/"false"**,給 "1" 會 ConfigError 拒絕啟動
  # (config.ts:71-73)。改成 `=true`——為一個新旗標破例接受 "1",會讓它與
  # `AI_KM_DEV_TRIGGERS`／`AI_KM_TEST_SANDBOX` 兩個既有旗標的規則不一致,
  # 而「三個 dev 旗標有兩種寫法」正是日後有人寫錯的來源。一致性比字面 1 值錢。
  @regression
  Scenario: A server started the way a person starts it answers with a citation
    Given apps/api is started as a separate process with AI_KM_DEV_SEED_FIXTURE=true
    When the demo user posts the question "文件擷取管線包含幾個階段？" to that server over HTTP
    Then the answer carries at least one citation from document "i2-doc-eng"

  @regression
  Scenario: The conversation list and SSE sync from before I2 still work
    When the demo user creates a conversation and sends one message
    Then the conversation appears in the demo user's list
    And a change event for that message is delivered on the stream
