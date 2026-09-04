@i1 @ingestion @phase-1 @standalone
Feature: A real PDF becomes searchable chunks whose citations still point at the original words
  Ingestion is the index-time half of the product: extract text from a PDF while
  keeping character offsets, cut it into chunks, embed every chunk through the
  model gateway, and write the vectors with the department they belong to. Every
  failure mode here is the silent kind — an empty extraction, a chunk stored
  without a department, a vector stored without the identity of the model that
  produced it — so each one is refused loudly instead of being reported as
  "0 chunks indexed".

  This phase is a backfill: every scenario below goes through the same entry
  points services/ingestion's own vitest tests use (see FEATURE.md 回填對照表).
  The embedding provider is the deterministic PF1 fake, so nothing here claims
  anything about semantic quality — only about plumbing, offsets and refusals.

  Background:
    Given the model gateway uses the deterministic embedding provider
    And an in-memory vector store

  Scenario: The capability runs on its own
    When the ingestion plugin is registered on a host application and that application becomes ready
    And the Chinese manual PDF is ingested through the host's ingestion seam under department "eng"
    Then the "ingestion" plugin is visible on the parent server instance
    And that ingest reports the document to be 2 pages long
    And the ingestion store holds exactly as many chunks as the ingest reported

  Scenario: A citation cut out of the stored text is the chunk word for word
    When the real Chinese fixture PDF is ingested under department "eng"
    Then slicing the extracted document text by each stored chunk's offsets gives back that chunk word for word
    And the extracted document text contains "知識管理系統設計文件"

  Scenario: The same PDF read twice produces the same characters as the day the golden hash was taken
    When the Chinese manual PDF is extracted twice
    Then both extractions hash to "998835e3530dcb1a6f4f38b9fcc2e067c7426ca5c6abce61736e966d1f0f4306"
    And the extractor names itself "pdfjs-dist@6.3.289+join-rules@1"

  Scenario: A scanned image-only PDF is refused instead of quietly indexing nothing
    When the scanned image-only PDF is ingested under department "eng"
    Then the vector store is still empty
    And it is rejected with "PdfEmptyTextError"
    And the ingestion refusal message mentions "索引了 0 個 chunk"

  Scenario: A password-protected PDF is refused rather than opened with a guessed empty password
    When the password-protected PDF is ingested under department "eng"
    Then the vector store is still empty
    And it is rejected with "PdfEncryptedError"
    And the ingestion refusal message mentions "已加密"

  Scenario: Re-importing a stored document under another department leaves the first department's view untouched
    Given the real Chinese fixture PDF is ingested under department "finance"
    And what the finance department can see is recorded
    When that same stored document is ingested again under department "maintenance"
    Then the finance department still sees exactly the chunks it saw before
    And the maintenance department sees none of that document
    And it is rejected with "DocumentScopeConflictError"

  Scenario: Every stored chunk carries the identity of the model that embedded it
    When the real Chinese fixture PDF is ingested under department "eng"
    Then every stored chunk records embedding model "embedding:deterministic" with 256 dimensions

  Scenario: A gateway that cannot name its embedding model gets nothing written
    Given the model gateway stops reporting which embedding model it used
    When the Chinese manual PDF reaches the embedding stage under department "eng"
    Then the vector store is still empty
    And it is rejected with "IngestionEmbeddingIdentityError"

  Scenario: A document handed in without a department is refused before any work is spent on it
    Given the embedding work the pipeline does is counted
    When the real Chinese fixture PDF is ingested with an empty department
    Then the vector store is still empty
    And it is rejected with "IngestionScopeError"
    And the "embedding" provider is never called

  Scenario: Re-cutting the same document keeps every citation id and boundary where it was
    When the extracted text of the Chinese manual PDF is cut into chunks twice
    Then both cuts produce the same chunk ids in the same order
    And both cuts put every chunk boundary at the same character
