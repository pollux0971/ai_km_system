@integration @i1
Feature: A real PDF goes in and every citation points back to the exact original text
  I1 is the walking skeleton the user accepted on 2026-09-03 (W1-00): one real
  Chinese PDF with non-embedded fonts runs through extraction, chunking,
  embedding (through the model gateway, fake deterministic provider) and the
  vector store, and a retrieval hit's offsets slice the stored original text
  to exactly the cited passage. Authorization runs before retrieval: the same
  document ingested under two departments is only ever visible to its own.

  Nothing here is semantically good — the embedding is feature hashing (PF1),
  not a real model. What I1 proves is plumbing and offsets, not answer quality.

  Background:
    Given the model gateway uses the deterministic embedding provider
    And an in-memory vector store

  @e2e @manual
  Scenario: A person sees that the citation is exactly the passage they meant
    Given the real Chinese fixture PDF is ingested under department "eng"
    When the person runs "pnpm demo:w1-00"
    Then the printed citation text equals the independently sliced original text
    And the person confirms "對,就是那段"

  Scenario: The pipeline runs on its own
    When the standalone command for this capability is run
    Then it exits with status 0
    And the output contains "citation offset verified"

  Scenario: Citation offsets slice the stored original text exactly
    Given the real Chinese fixture PDF is ingested under department "eng"
    When a person in department "eng" asks "文件擷取管線包含幾個階段？"
    Then the top hit's text equals the original text sliced by its offsets
    And the top hit's score is greater than 0
    And the top hit belongs to department "eng"

  Scenario: The same question under another department never sees the other department's document
    Given the real Chinese fixture PDF is ingested under department "eng"
    And the same PDF is ingested again under department "hr"
    When a person in department "hr" asks "文件擷取管線包含幾個階段？"
    Then every hit belongs to department "hr"
    And no hit belongs to department "eng"

  Scenario: An empty scope denies everything rather than allowing everything
    Given the real Chinese fixture PDF is ingested under department "eng"
    When a person with no department asks "文件擷取管線包含幾個階段？"
    Then no hit is returned at all

  Scenario: A document without a department is refused at ingest
    When the real Chinese fixture PDF is ingested with an empty department
    Then it is rejected with "IngestionScopeError"
    And the vector store is still empty
