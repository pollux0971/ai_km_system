@i1 @feedback-analytics @phase-1 @standalone
Feature: People rate the answers they get, and only the right admins see what that adds up to
  A person marks an AI answer OK or NG and, when it is NG, picks a reason from a
  fixed list. The product also records usage events under the identity of whoever
  is signed in — never one handed over in the request. Auditors read the
  aggregates and the cross-owner feedback queue built out of those two streams;
  everybody else is turned away before a single number or excerpt leaves the
  server.

  This phase is a backfill. Every scenario drives the real assembled server —
  the same `buildServer()` + real login + real routes that
  `apps/api/src/feedback-service-wiring.test.ts`,
  `services/feedback/src/routes/*.test.ts` and
  `services/conversation/src/routes/message-feedback.test.ts` already exercise
  (see FEATURE.md 回填對照表). No seam is mocked: real session cookies, real
  `analytics.yaml`, real migrations, real role gate.

  Background:
    Given a fresh server with fake providers

  Scenario: The capability runs on its own and stamps the signed-in person onto the event
    When the maintenance engineer records a "conversation_created" usage event at "2026-08-28T05:00:00.000Z"
    Then the recorded usage event belongs to the maintenance engineer
    And the response status is 201

  Scenario: An event that names somebody else as the user is refused before anything is written
    When the maintenance engineer records a usage event that names "mallory" as the user
    Then the usage log holds no event at all
    And the response status is 400
    And the response error code is "VALIDATION_ERROR"

  Scenario: Daily active users counts people, not the events they produced
    Given the maintenance engineer asked 2 questions and the salesperson asked 1 question on "2026-08-28"
    When the auditor reads the usage dashboard for "2026-08-28"
    Then the usage dashboard reports 2 daily active users and 3 questions asked

  Scenario: The date narrows who was active but not the running question total
    Given the maintenance engineer asked 2 questions and the salesperson asked 1 question on "2026-08-28"
    When the auditor reads the usage dashboard for "2026-01-01"
    Then the usage dashboard reports 0 daily active users and 3 questions asked

  Scenario: Latency is a real average of the answers inside the window
    Given the maintenance engineer's answers today took 100, 200 and 300 milliseconds
    When the auditor reads the latency dashboard over the default window
    Then the latency dashboard reports an average of 200 milliseconds over 3 answers

  Scenario: An answer older than the default window leaves the average empty rather than zero
    Given the maintenance engineer's only answer took 999 milliseconds 8 days ago
    When the auditor reads the latency dashboard over the default window
    Then the latency dashboard reports no average at all over 0 answers

  Scenario: Widening the window pulls that older answer back into the average
    Given the maintenance engineer's only answer took 999 milliseconds 8 days ago
    When the auditor reads the latency dashboard over 30 days
    Then the latency dashboard reports an average of 999 milliseconds over 1 answer

  Scenario: A general user asking for the usage dashboard is handed no numbers at all
    Given the maintenance engineer asked 2 questions and the salesperson asked 1 question on "2026-08-28"
    When a general user reads the usage dashboard for "2026-08-28"
    Then the reply carries none of the usage numbers
    And the response status is 403
    And the response error code is "PERMISSION_DENIED"

  Scenario: The queue is deliberately cross-owner — an auditor triages other people's feedback
    Given the maintenance engineer rated an answer NG with reason "INCORRECT" and the salesperson rated another answer OK
    When the auditor opens the feedback queue
    Then the feedback queue holds the maintenance engineer's answer and the salesperson's answer
    And the maintenance engineer's queued answer carries the reason "INCORRECT"

  Scenario: A general user opening that same queue is handed nobody's feedback
    Given the maintenance engineer rated an answer NG with reason "INCORRECT" and the salesperson rated another answer OK
    When a general user opens the feedback queue
    Then the reply carries none of the rated answers
    And the response status is 403
    And the response error code is "PERMISSION_DENIED"

  Scenario: The queue carries a short excerpt, never the whole answer
    Given the maintenance engineer rated an answer far longer than an excerpt as OK
    When the auditor opens the feedback queue
    Then no queued answer carries the whole original answer
    And every queued excerpt is at most 200 characters

  Scenario: A reason code becomes words an admin can read, and an unrecognised code survives unchanged
    When the admin console labels the feedback reason codes "INCORRECT" and "SOME_FUTURE_CODE"
    Then the labelled reasons read "答案不正確" and "SOME_FUTURE_CODE"

  Scenario: Rating an answer NG and choosing a reason stores both against that answer
    Given the maintenance engineer has one AI answer nobody has rated yet
    When the maintenance engineer rates that answer "NG" and gives the reason "INCORRECT"
    Then that answer is stored with verdict "NG" and reason "INCORRECT"
    And the response status is 200

  Scenario: A reason cannot exist without the rejection it is supposed to explain
    Given the maintenance engineer has one AI answer nobody has rated yet
    When the maintenance engineer gives the reason "INCORRECT" on that unrated answer
    Then that answer still carries no verdict and no reason
    And the response status is 400
