@i1 @generation @phase-1 @standalone
Feature: A grounded answer that only ever cites what the person was already allowed to see
  Generation is the second half of the RAG path: authorisation and retrieval are
  already spent by the time context arrives here. This capability projects the
  authorised passages into a model-gateway request field by field, calls the
  gateway (never a provider directly), and hands back an answer whose every
  citation names a passage that was supplied — offsets and document id repeated
  unchanged so a reader can open the original text.

  Two failure modes here are silent, which is why they are scenarios rather than
  comments: a fabricated source looks exactly like a real one to the reader, and
  a department label riding along inside the context would reach a model prompt
  without anything reporting an error.

  This phase is a backfill: every scenario below is bound to the same entry
  points services/generation's own vitest tests use (see FEATURE.md 回填對照表).
  The answering model is the deterministic canned PF1 provider; nothing here
  claims anything about answer quality.

  Background:
    Given a person's authorised context holds one bearing passage and one lubrication passage

  Scenario: The capability runs on its own
    When the generation plugin is registered on a fresh server and the server becomes ready
    And the person asks "泵浦維修紀錄" through the generation seam on the parent instance
    Then the "generation" plugin is visible on the parent server instance
    And every citation names a passage that was in the context
    And the citation for the bearing passage repeats its document and offsets unchanged

  Scenario: An answer cites the supplied passages and its offsets still address the original document
    When the person asks "軸承過熱要怎麼處理" over that context
    Then every citation names a passage that was in the context
    And the citation for the bearing passage repeats its document and offsets unchanged
    And slicing the original maintenance document by that citation's offsets gives the passage text

  Scenario: One fabricated source rejects the whole answer instead of being quietly dropped
    Given the answering model fabricates one extra source alongside a real one
    When the person asks "軸承" over that context
    Then it is rejected with "FabricatedCitationError"
    And no generated answer is handed back at all

  Scenario: The department label never travels with the context to the answering model
    When the person asks "軸承過熱" over that context
    Then no department label reached the answering model
    And the answering model received the bearing passage's text and offsets unchanged

  Scenario: With nothing to cite the answering model is not called at all
    When the person asks "軸承過熱" with an empty context
    Then the "generation" provider is never called
    And the answer says there is nothing to cite and carries no citation

  Scenario: An empty question is refused before any model is asked anything
    When the person asks "" over that context
    Then it is rejected with "GenerationServiceError"
    And the "generation" provider is never called
