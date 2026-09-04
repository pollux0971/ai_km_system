@i1 @knowledge-management @phase-1 @standalone
Feature: A person keeps knowledge bases and the documents that sit inside them
  A knowledge base is a shelf a person creates, searches and fills — with an
  uploaded file, an imported web address, or text typed straight in. Every
  document can be renamed, retried after a failed processing run, archived or
  deleted, and no action ever reaches sideways into another knowledge base's
  shelf.

  MOCK, NOT INTEGRATION (鐵律 5). Every automated scenario below runs against
  apps/web's browser-side mock layer (src/lib/knowledge-bases.ts and
  src/lib/knowledge-documents.ts) over a session-storage store. There is no API
  route, no database, no object storage and no ingestion pipeline behind it:
  contracts/openapi has no knowledge paths at all, and the real Document entity
  belongs to E06 (Team B, not built). A green run here is evidence that the
  browser-side capability behaves as specified — it is NOT evidence that
  knowledge management is integrated with anything.

  This phase is a backfill: every automated scenario is bound to the same entry
  points apps/web's own vitest tests call (see FEATURE.md 回填對照表). The
  session-storage store is the only thing supplied by the step layer, standing
  in for the jsdom one those vitest tests run against.

  Background:
    Given an empty browser session holding the sample knowledge bases

  Scenario: The knowledge library comes up on its own, with no server and no database behind it
    When the knowledge library is opened with no search term
    Then the knowledge library shows exactly the knowledge bases "產品保固政策, 設備維修標準作業程序, 人力資源與請假規範"
    And knowledge base "kb-sample-1" shows exactly the documents "產品保固條款.pdf, 理賠申請流程.docx, 常見保固問題 FAQ.pdf"

  Scenario: Searching the library by name narrows it to the one knowledge base whose name matches
    When the knowledge library is searched for "維修"
    Then the knowledge library shows exactly the knowledge bases "設備維修標準作業程序"

  Scenario: A rename aimed through the wrong knowledge base leaves the document's name untouched
    When document "doc-sample-4" is renamed to "改名嘗試.pdf" through knowledge base "kb-sample-1"
    Then knowledge base "kb-sample-2" shows exactly the documents "設備故障排除手冊.pdf"
    And the knowledge library refuses it with "NOT_FOUND"

  Scenario: An uploaded file lands on that knowledge base's shelf carrying the size the browser reported
    When a file named "教育訓練簡報.pdf" of 4096 bytes is uploaded to knowledge base "kb-sample-3"
    Then knowledge base "kb-sample-3" shows exactly the documents "教育訓練簡報.pdf"
    And knowledge base "kb-sample-3" records the document "教育訓練簡報.pdf" with a size of 4096 bytes

  Scenario: A blank file name is refused and no document is put on the shelf
    When a file named " " of 4096 bytes is uploaded to knowledge base "kb-sample-3"
    Then knowledge base "kb-sample-3" shows exactly the documents ""
    And the knowledge library refuses it with "VALIDATION_ERROR"
    And the knowledge library's refusal message is "檔案名稱不得為空。"

  Scenario: Uploading into a knowledge base that does not exist is refused instead of conjuring one
    When a file named "孤兒文件.pdf" of 1024 bytes is uploaded to knowledge base "kb-does-not-exist"
    Then the knowledge library shows exactly the knowledge bases "產品保固政策, 設備維修標準作業程序, 人力資源與請假規範"
    And the knowledge library refuses it with "NOT_FOUND"

  Scenario: An address that is not a web page is refused instead of being imported
    When the address "javascript:alert(1)" is imported into knowledge base "kb-sample-3"
    Then knowledge base "kb-sample-3" shows exactly the documents ""
    And the knowledge library refuses it with "VALIDATION_ERROR"
    And the knowledge library's refusal message is "只支援 http(s) 網址。"

  Scenario: An imported link records no size while typed-in text records the real byte count of what was typed
    Given the address "https://example.com/warranty" is imported into knowledge base "kb-sample-3"
    When the text knowledge "手寫筆記" containing "軸承過熱" is added to knowledge base "kb-sample-3"
    Then knowledge base "kb-sample-3" records the document "https://example.com/warranty" with no size at all
    And knowledge base "kb-sample-3" records the document "手寫筆記" with a size of 12 bytes

  Scenario Outline: The simulated processing failure only reaches a document while the mock-trigger flag is on
    Given the knowledge library's mock-trigger flag is "<flag>"
    When a file named "毀損報告[模擬:KB_PROCESSING_FAILED].pdf" of 500 bytes is uploaded to knowledge base "kb-sample-3"
    Then knowledge base "kb-sample-3" records the document "毀損報告[模擬:KB_PROCESSING_FAILED].pdf" with processing status "<status>"

    Examples:
      | flag | status |
      | on   | failed |
      | off  | ready  |

  Scenario: Retrying a document that never failed is refused rather than silently restarted
    When document "doc-sample-1" is retried through knowledge base "kb-sample-1"
    Then the knowledge library refuses it with "VALIDATION_ERROR"
    And the knowledge library's refusal message is "這份文件目前不是處理失敗狀態，不需要重試。"

  @manual
  Scenario: The knowledge library page comes up from the one dev-server command
    When a person runs the web dev server and opens the knowledge library page
    Then the person sees the three sample knowledge bases listed on the page
    And the person is told on screen that this list is browser-side mock data

  @e2e @manual
  Scenario: A person uploads a file on the knowledge base page and sees it appear in the document list
    Given a person is signed in to the web app in a real browser
    When the person picks a file on a knowledge base's document page and confirms the upload
    Then the person sees that file's name and size in that knowledge base's document list
    And the person sees the same document is absent from every other knowledge base
