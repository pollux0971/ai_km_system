@i1 @conversation @phase-1 @standalone
Feature: A person keeps a conversation, revises its answers, and every window they have open stays in step
  A conversation belongs to exactly one person. Starting one, sending a message
  into it and revising an answer each write to the person's own change log in
  the same transaction as the write itself, and the log is then streamed to
  every window that person has open. A window that was disconnected reconnects
  with the last change number it saw and is either replayed exactly what it
  missed, or told to re-fetch everything — never handed a partial log that
  looks complete.

  This phase is a backfill. Every scenario below goes through the same entry
  points services/conversation's own vitest tests use: the real
  `conversationPlugin` mounted by `buildTestApp()`, the real HTTP routes, the
  real migrated SQLite schema and the real SSE stream over a listening socket
  (see FEATURE.md 回填對照表). Nothing here is mocked.

  Background:
    Given a conversation workspace with an empty change log

  Scenario: The conversation domain mounts on a bare server and answers there
    When the conversation domain is mounted on a bare server and that server becomes ready
    Then the "changeEventBus" plugin is visible on the parent server instance
    And asking that instance for the conversation list without a session is challenged rather than answered as a missing route

  Scenario: Starting a conversation gives it the server's own defaults and one entry in the change log
    When "alice" starts a new conversation
    Then the new conversation is titled "新對話" in mode "normal" previewing "尚無訊息。"
    And the change log for "alice" reads "conversation.created#1"

  Scenario: Sending a message moves the conversation's preview forward and records both changes in order
    Given "alice" has started a conversation
    When "alice" sends the message "軸承過熱要怎麼處理?" into that conversation
    Then that conversation now previews "軸承過熱要怎麼處理?"
    And the change log for "alice" reads "conversation.created#1, message.created#2, conversation.updated#3"

  Scenario: Revising an answer keeps every earlier wording, oldest first
    Given "alice" has started a conversation
    And the assistant has answered "先停機" in that conversation
    And that answer has already been revised to "先停機並記錄運轉時數"
    When "alice" revises that answer to "先停機、記錄運轉時數並通知值班工程師" marking it "PARTIAL"
    Then that answer now reads "先停機、記錄運轉時數並通知值班工程師" in state "PARTIAL"
    And the wordings it replaced are kept oldest first as "先停機 | 先停機並記錄運轉時數"

  Scenario: Another person's conversation is refused outright, not quietly shown as empty
    Given "alice" has started a conversation
    When "bob" opens the conversation "alice" started
    Then the response status is 403
    And the refusal discloses neither the conversation's id nor its title

  Scenario: A second window is told about a new conversation the moment it is created
    Given a second window is watching "alice"'s conversation changes
    When "alice" starts a new conversation
    Then the watching window is told "conversation.created#1" naming that conversation

  Scenario: A second window is never told about somebody else's conversation
    Given a second window is watching "alice"'s conversation changes
    When "bob" starts a new conversation
    Then the watching window is never told about that conversation

  Scenario: Reconnecting with a checkpoint replays only what was missed, in order
    Given the change log already holds 10 earlier changes for "alice"
    When a window reconnects to "alice"'s conversation changes from checkpoint 3
    Then the reconnecting window is replayed the changes numbered "4, 5, 6, 7, 8, 9, 10"

  Scenario Outline: A checkpoint the server cannot honour asks for a full re-fetch instead of a partial replay
    Given the change log already holds <held> earlier changes for "alice"
    When a window reconnects to "alice"'s conversation changes from checkpoint <checkpoint>
    Then the reconnecting window is asked to re-fetch everything because "<reason>"

    Examples:
      | held | checkpoint | reason                |
      | 0    | 999        | UNKNOWN_LAST_EVENT_ID |
      | 502  | 1          | EVENT_LOG_TRUNCATED   |

  Scenario: A conversation write that rolls back is never announced and leaves nothing behind
    Given a second window is watching "alice"'s conversation changes
    When starting a conversation for "alice" fails midway and is rolled back
    Then the change log for "alice" reads ""
    And "alice" owns no conversation at all
    And the watching window is never told about that conversation
