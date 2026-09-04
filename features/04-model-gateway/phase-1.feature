@i1 @model-gateway @phase-1 @standalone
Feature: One gateway for every model call — vectors, answers and transcripts
  Nothing in this product talks to a model on its own. Retrieval asks this
  gateway for vectors, answering asks it for an answer assembled only from the
  passages it was handed, and the microphone asks it for a transcript. The two
  HTTP routes are wrappers over the very same in-process functions, so the way
  in from inside the process and the way in from outside cannot drift apart.

  This phase is a backfill: every scenario below enters through the same door
  this package's own vitest tests use (see FEATURE.md 回填對照表). The providers
  are the deterministic hasher and the canned answer writer (PF1), so nothing
  here claims anything about vector or answer QUALITY — a real model is PF3 and
  waits on DECISIONS_NEEDED #2.

  Background:
    Given a model gateway built on the deterministic embedder and the canned answer writer

  Scenario: The capability runs on its own
    Given the gateway plugin is prepared for a host that has loaded the embedding and generation contracts
    When the model gateway plugin is registered on a bare server and the server becomes ready
    Then the "modelGateway" plugin is visible on the parent server instance
    And embedding "軸承過熱" through that gateway seam yields one 256-number vector of magnitude 1

  Scenario: A batch comes back in the order it was sent, each vector tagged with its own position
    When the gateway embeds "軸承過熱", "冷卻風扇異音" and "bearing overheating"
    Then the gateway returns 3 embedding vectors whose positions are 0, 1, 2 in that order
    And the three returned vectors differ from one another

  Scenario: A batch larger than the contract allows is refused, not quietly trimmed
    When the gateway embeds a batch of 257 texts
    Then the gateway refuses the oversized batch, naming the 256 limit and the 257 texts it was sent

  Scenario: A model whose vectors are the wrong length is refused instead of ranking silently wrongly
    Given the embedding provider declares 256 dimensions but answers with 4-number vectors
    When the gateway embeds "軸承過熱"
    Then the gateway refuses the mismatched vectors, naming the declared 256 and the returned 4

  Scenario: The answer cites exactly the passages it was handed
    Given two maintenance passages are handed to the gateway as the only sources
    When someone asks the gateway "軸承過熱怎麼處理"
    Then the answer cites "doc-maint-001#0" then "doc-maint-001#1", in the order they were supplied

  Scenario: An answer citing a passage nobody supplied is thrown away whole
    Given two maintenance passages are handed to the gateway as the only sources
    And the answer writer invents an extra citation "ghost-chunk#0"
    When someone asks the gateway "軸承過熱怎麼處理"
    Then the gateway refuses the whole answer, naming the invented "ghost-chunk#0"

  Scenario: With nothing retrieved the gateway declines to answer rather than answering from memory
    When someone asks the gateway "公司去年的營收是多少" with no sources at all
    Then the gateway declines to answer without sources, rather than answering from memory

  Scenario: The embeddings route hands back exactly what an in-process caller gets
    When a signed-in caller posts "軸承過熱" and "maintenance log" to the embeddings route
    Then the embeddings route answered exactly what the in-process gateway answers

  Scenario: An empty request is refused at the route with the code the contract declares
    When a signed-in caller posts an empty input list to the embeddings route
    Then the response status is 400
    And the response error code is "VALIDATION_ERROR"
    And the body satisfies the "embedding" contract for "/embeddings" at status 400

  Scenario: Someone who is not signed in never reaches the model
    When an anonymous caller posts "軸承過熱" to the embeddings route
    Then the response status is 401
    And the "embedding" provider is never called

  Scenario: Without its contract loaded the gateway mounts no embeddings route at all
    Given the gateway plugin is prepared for a host that has loaded no contracts
    When the model gateway plugin is registered on a bare server and the server becomes ready
    And a signed-in caller posts "軸承過熱" to that bare server's embeddings route
    Then the response status is 404

  Scenario: A spoken Mandarin clip comes back as Traditional Chinese
    Given a transcription endpoint whose recogniser always returns "这是假结果"
    When a signed-in person uploads a 1500 ms clip recorded at 16000 Hz for transcription
    Then the transcript reads "這是假結果" while the recogniser's own raw text stays "这是假结果"

  Scenario: A clip recorded at the wrong sample rate is refused with the reason, not sent to the model
    Given a transcription endpoint whose recogniser always returns "这是假结果"
    When a signed-in person uploads a 1000 ms clip recorded at 44100 Hz for transcription
    Then the transcription refusal reason is "UNSUPPORTED_SAMPLE_RATE"
    And the response status is 400
    And the response error code is "VALIDATION_ERROR"
    And the "transcription" provider is never called
