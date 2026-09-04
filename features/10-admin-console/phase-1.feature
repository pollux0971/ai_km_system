@i1 @admin-console @phase-1 @standalone
Feature: The admin console shows departments, groups, connectors and system health only to the administrators entitled to them
  The console is two halves that must agree. Its privileged reads live behind
  the API's own role gate (`/v1/admin/health`, contract `analytics.yaml`
  `x-required-roles`); its pages carry a published "who may open this" table
  that the route guard resolves before rendering anything. Everything a person
  who is not entitled to a page could learn — a subsystem reading, the name of
  a role that would have been let in — is treated as leaked data, not as a
  cosmetic detail.

  This phase is a backfill: every scenario below goes through the same entry
  point the existing vitest tests use — a real `buildServer()` with a real
  login and `inject()`, and the console's own route-access and admin data
  functions called directly (see FEATURE.md 回填對照表). The department, group
  and connector records are the console's own in-app store, which is what the
  approved stories actually built; nothing here claims a backend integration
  that does not exist.

  Scenario: The console's privileged reads answer on a server built from nothing else
    Given a fresh server with fake providers
    When "demo-it" signs in to the admin console and opens the system health page
    Then the admin console shows readings for the subsystems "api, asr, database, migrations"
    And every subsystem reading carries a status the admin console can display
    And the response status is 200

  Scenario: The highest administrator passes a gate that never names their role
    Given a fresh server with fake providers
    When "demo-super" signs in to the admin console and opens the system health page
    Then the admin console shows readings for the subsystems "api, asr, database, migrations"
    And the response status is 200

  Scenario: A signed-in general user is turned away and learns nothing about the system
    Given a fresh server with fake providers
    When "demo-user" signs in to the admin console and opens the system health page
    Then the admin console shows no subsystem reading at all
    And the refusal names none of the roles the admin console would have let in
    And the response error code is "PERMISSION_DENIED"

  Scenario: Someone who never signed in is turned away before any subsystem is read
    Given a fresh server with fake providers
    When nobody signs in to the admin console and the system health page is opened
    Then the admin console shows no subsystem reading at all
    And the response error code is "UNAUTHENTICATED"

  Scenario Outline: Each console page admits exactly the roles published for it, in the published order
    When the admin console is asked who may open "<page>"
    Then the admin console admits exactly "<roles>"

    Examples:
      | page                      | roles                                 |
      | /users                    | it_administrator, super_administrator |
      | /users/mock-user-it-admin | it_administrator, super_administrator |
      | /departments              | super_administrator                   |
      | /connectors               | it_administrator, super_administrator |
      | /health                   | it_administrator, super_administrator |

  Scenario: A path that merely looks like a console page inherits nobody's permission
    When the admin console is asked who may open "/document-failures-report"
    Then the admin console admits nobody at all

  Scenario: The console's department list is the four departments the organisation already uses
    When an administrator opens the admin console's department list
    Then the admin console lists the departments "資訊部, 維修部, 業務部, 稽核部"

  Scenario: The console's group list is the three groups people are already assigned to
    When an administrator opens the admin console's group list
    Then the admin console lists the groups "一般使用者群組, 維修工程師群組, 業務群組"

  Scenario: A department added without a name is refused instead of being stored nameless
    When an administrator adds a department named "   " in the admin console
    Then the admin console rejects the change with "VALIDATION_ERROR"
    And the admin console explains "請輸入部門名稱。"

  Scenario: Every connector starts switched off, because none of them has ever been connected
    When an administrator opens the admin console's connector list
    Then the admin console lists the connectors "erp, mes, crm, hr, scm, plm, iot, generic-rest, database-view"
    And every connector in the admin console is switched off

  @e2e @manual
  Scenario: An administrator walks the four management pages in a browser
    Given the admin console is running for a signed-in IT administrator
    When that administrator opens 部門管理, 群組管理, 連接器管理 and 系統健康儀表板 in turn
    Then each page renders its own list rather than an error state
    And the administrator confirms "四個頁面都打得開,而且資料就是自動場景印出來的那一份"
