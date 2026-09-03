@i1 @name @phase-1 @standalone
Feature: (one line: what this capability already lets a person do)
  (Two or three lines: why this exists and where it sits in the whole.
  For a backfilled phase-1, state that every scenario below is bound to an
  existing test entry point — see FEATURE.md "回填對照表".)

  Background:
    Given (shared precondition, fixtures and fake providers only)

  Scenario: The capability runs on its own
    When the plugin is registered on a fresh server and the server becomes ready
    Then the decoration is visible from the parent instance
    And (one specific, observable marker)

  Scenario: (what happens when)
    Given (precondition)
    When (action in the person's language, not the implementation's)
    Then (observable result — a value that changes when the implementation breaks)
    And (second observable result)

  Scenario Outline: (for variants)
    Given an input of <input>
    When the action runs
    Then the result is <output>

    Examples:
      | input | output |
      |       |        |
