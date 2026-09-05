@integration @i3
Feature: Two people in different departments ask the same question and each sees only their own department's documents
  I3 is where authorization stops being a fixed value and starts coming from the
  signed-in identity. Until I3, ADR 0014 hands every caller the same
  `dept:eng` scope on purpose, and `docs/integration/i2-ask-in-web.feature`
  asserts exactly that — deliberately, so the limitation is visible and fails
  loudly the day it is removed rather than disappearing quietly.

  The first scenario below arrived here on 2026-09-05, VERBATIM, from the I2
  integration file. It was written there before ADR 0014 existed and could never
  have passed under I2's own definition; the I2 run was the first place that
  contradiction became visible, because five phase-done runs each went green
  without ever putting the two specs in the same process.

  NOTE FOR WHOEVER LANDS I3: the steps these scenarios need live in
  `features/steps/integration.steps.ts`, and today several of them branch on
  `this.tags.includes("@i2")` to choose the real-server path. Extending that
  branch to `@i3` is part of I3's work — until then these scenarios are
  UNDEFINED, which is "not built yet", not "broken" (GHERKIN_WORKFLOW §7.6).

  Background:
    Given a fresh server with fake providers
    And the real Chinese fixture PDF is ingested under department "eng"

  Scenario: A person outside the department gets nothing from that document
    Given the demo user belongs to department "hr"
    When the demo user posts the question "文件擷取管線包含幾個階段？" to a new conversation
    Then the response status is 201
    And no citation belongs to a document in department "eng"

  @e2e @manual
  Scenario: Two people in two departments ask the same question in the browser
    Given the person is logged in as a member of department "hr" in apps/web
    When that person asks "文件擷取管線包含幾個階段？" in a new conversation
    Then the answer carries no citation from a document in department "eng"
    And a person in department "eng" asking the same question does get one
    And the person confirms each of them saw only their own department's document
