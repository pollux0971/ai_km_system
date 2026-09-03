@integration @i2
Feature: A person asks a question in the web app and gets an answer whose citations open the original passage
  I2 is the first time the experience layer talks to the data layer. Until now
  apps/web answered from mocks and the RAG pipeline answered only tests. After
  I2 a person logs in, asks a question about a document that was ingested by
  the I1 pipeline, reads an answer produced through the model gateway, and
  clicks a citation that opens the exact original passage the offsets select.

  The model may still be fake (PF1) — the answer text will be canned. What I2
  proves is that the seam apps/web → apps/api → retrieval → generation →
  citations → UI exists end to end and fails closed on scope.

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

  Scenario: A question with no matching document is answered with no citation rather than an invented one
    When the demo user posts the question "這份文件裡沒有的主題" to a new conversation
    Then the response status is 201
    And the answer carries no citation
    And the answer says it found nothing to cite

  Scenario: A person outside the department gets nothing from that document
    Given the demo user belongs to department "hr"
    When the demo user posts the question "文件擷取管線包含幾個階段？" to a new conversation
    Then the response status is 201
    And no citation belongs to a document in department "eng"

  @regression
  Scenario: I1 still holds — citation offsets slice the stored original text exactly
    When a person in department "eng" asks "文件擷取管線包含幾個階段？"
    Then the top hit's text equals the original text sliced by its offsets
    And the top hit's score is greater than 0

  @regression
  Scenario: The conversation list and SSE sync from before I2 still work
    When the demo user creates a conversation and sends one message
    Then the conversation appears in the demo user's list
    And a change event for that message is delivered on the stream
