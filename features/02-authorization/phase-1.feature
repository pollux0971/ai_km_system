@i1 @authorization @phase-1 @standalone
Feature: A person's grants become a scope that can only ever narrow what they may see
  Authorization is the value that goes INTO retrieval, built before any store is
  touched: a principal, plus the exact department keys that principal may read.
  Deny-Wins lives here, in the construction — an unlisted key, an unlabelled
  record and a person with no grants at all are all refusals, while a caller who
  brought no principal at all is a rejected bug rather than a quiet deny-all.

  This phase is a backfill and it is deliberately honest about the gap: nothing
  yet turns a signed-in identity into a scope (E04-S009 is still blocked), so the
  last scenario records what identity does give us today and that it hands over
  no ready-made scope keys. Every scenario is bound to the same entry points the
  packages' own vitest tests use — see FEATURE.md 回填對照表. Filtering a store
  WITH a scope belongs to 06-retrieval and is not repeated here.

  Scenario: The capability runs on its own
    Given a person "person-maintenance" whose grants are exactly "dept:maintenance"
    When that person's authorization scope is built
    Then the scope refuses a record labelled "dept:finance"
    And the scope admits a record labelled "dept:maintenance"
    And the scope names the person as "person-maintenance"

  Scenario: A caller who brings no principal is a bug, not a person who may read nothing
    Given a person "" whose grants are exactly "dept:maintenance"
    When that person's authorization scope is built
    Then it is rejected with "RetrievalScopeError"
    And the refusal blames the missing principal rather than the grants

  Scenario: A person with no grants yet is a real person who may read nothing
    Given a person "u-new" whose grants are exactly ""
    When that person's authorization scope is built
    Then the scope refuses a record labelled "dept:maintenance"
    And the scope refuses a record labelled "dept:finance"
    And the scope names the person as "u-new"

  Scenario: A record carrying no department label is refused rather than treated as public
    Given a person "u-1" whose grants are exactly "dept:maintenance, dept:ops"
    When that person's authorization scope is built
    Then the scope refuses a record labelled ""
    And the scope refuses a record with no label at all
    And the scope admits a record labelled "dept:ops"

  Scenario Outline: Grants become a database filter that can only narrow, never widen
    Given a person "u-1" whose grants are exactly "<grants>"
    When that person's authorization scope is turned into a database filter on "<column>"
    Then the filter reads "<sql>" and carries the values "<values>"

    Examples:
      | grants                     | column      | sql                   | values                     |
      | dept:maintenance, dept:ops | m.scope_key | m.scope_key IN (?, ?) | dept:maintenance, dept:ops |
      |                            | scope_key   | 1 = 0                 |                            |

  Scenario: The last line of defence names the department that leaked instead of dropping it quietly
    Given a person "u-1" whose grants are exactly "dept:maintenance"
    When that person's authorization scope is built
    And records labelled "dept:maintenance, dept:finance" are checked on their way out
    Then the refusal names the department "dept:finance"
    And the refusal does not name the department "dept:maintenance"
    And it is rejected with "ScopeLeakError"

  Scenario: When nothing is out of scope the check hands back the very same records
    Given a person "u-1" whose grants are exactly "dept:maintenance, dept:ops"
    When that person's authorization scope is built
    And records labelled "dept:ops, dept:maintenance" are checked on their way out
    Then the authorization check hands back the very same records

  Scenario: A signed-in identity already names a department, and hands over no ready-made scope keys
    Given a fresh server with fake providers
    When the authorization layer looks up the signed-in identity of "demo-user"
    Then the identity names department "資訊部" and group "一般使用者群組"
    And the identity hands over no ready-made scope keys
