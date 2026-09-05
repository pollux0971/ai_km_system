@model-gateway @phase-2
Feature: The two model-gateway routes hold up on the real server, under a real session
  This phase is a narrow, backfilled verification of exactly two things FEATURE.md's
  phase-2 row claims: that the model gateway rides along when apps/api starts for
  real, and that its two HTTP routes answer to a real, cookie-based session rather
  than the `x-test-user` shortcut other phase-1 harnesses use.

  It deliberately does NOT touch whether 06-retrieval or 07-generation call these
  two routes to get their own embeddings or answers — DECISIONS_NEEDED #38 found
  that FEATURE.md's older wording assumed a wiring that never existed (each of
  them builds its own in-process gateway instead). That is a separate, already
  recorded question; these three scenarios only exercise the routes themselves.

  Background:
    Given the real API server has started the way apps/api actually starts it

  Scenario: The model gateway rides along when the real server starts
    Then the model gateway is present on the running server

  Scenario: Nobody reaches a model without signing in first
    When someone who has not signed in asks for an embedding
    Then the response status is 401
    And the refusal names no role or account that would have been let in
    When someone who has not signed in asks for a generated answer
    Then the response status is 401
    And the refusal names no role or account that would have been let in

  Scenario: A signed-in person's requests reach the model and come back shaped the way the contracts promise
    Given a demo person has signed in with a real session, not a test shortcut
    When that signed-in person asks for an embedding of "軸承過熱"
    Then the response status is 200
    And the body satisfies the "embedding" contract for "/embeddings" at status 200
    When that signed-in person asks the gateway to generate an answer from one real source passage
    Then the response status is 200
    And the body satisfies the "generation" contract for "/generate" at status 200
