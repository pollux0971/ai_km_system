@i1 @retrieval @phase-1 @standalone
Feature: Authorised retrieval returns only what the person may see, ranked and traceable
  Retrieval takes a question and a person's scope, embeds the question through
  the model gateway, asks the vector store WITH the scope as a pre-filter,
  re-asserts that nothing outside the scope came back, and returns hits whose
  offsets point into the stored original text. Authorization runs before
  retrieval and Deny-Wins: an empty scope returns nothing, never everything.

  This phase is a backfill: every scenario below is bound to the same entry
  points the package's own vitest tests use (see FEATURE.md 回填對照表). The
  embedding provider is the deterministic PF1 fake; nothing here claims
  semantic quality.

  Background:
    Given a retrieval store seeded with one maintenance chunk and one engineering chunk

  Scenario: The capability runs on its own
    When the retrieval plugin is registered on a fresh server and the server becomes ready
    Then the retrieval seam is visible from the parent instance
    And a maintenance person asking "軸承過熱" through that seam gets exactly the maintenance chunk

  Scenario: Deny-Wins — a person in another department gets nothing, not the other department's chunk
    When a finance person asks "軸承過熱"
    Then the hits are empty

  Scenario: An empty scope returns nothing rather than everything
    When a person with an empty scope asks "軸承過熱"
    Then the hits are empty

  Scenario: The authorised person gets the right chunk first
    When a maintenance person asks "軸承過熱"
    Then the first hit's text is "軸承過熱應先停機並記錄運轉時數"
    And the first hit's score is greater than 0
    And every hit is in department "maintenance"

  Scenario: Hit offsets point into the original document, not into the chunk
    When a maintenance person asks "軸承過熱"
    Then the first hit's offsets slice the original document to its text

  Scenario: Leak detection is active — a store that ignores the scope makes retrieval throw
    Given the store's scope filter is switched off
    When a finance person asks "軸承過熱"
    Then it is rejected with "ScopeLeakError"

  Scenario: An empty question is refused, not treated as "search everything"
    When a maintenance person asks ""
    Then it is rejected with "RetrievalServiceError"

  Scenario: A store indexed by a different embedding model is refused instead of silently mis-ranked
    Given the seeded chunks were indexed under embedding identity "model-A"
    When a maintenance person asks "軸承過熱" with the version guard on and a provider whose identity is "model-B"
    Then it is rejected with "EmbeddingVersionMismatchError"
    And the rejection message names both "model-A" and "model-B"

  Scenario: Reranking never invents a hit and never leaves the scope
    Given the store also holds three near-duplicate engineering chunks and one different engineering chunk
    When an engineering person asks "軸承過熱" with reranking for the top 2
    Then every returned hit is one of the store's own candidates
    And every hit is in department "eng"
    And the two returned hits are not near-duplicates of each other
