@i1 @identity @phase-1 @standalone
Feature: A person signs in, carries a session, and a forged request gets nowhere
  Identity owns one answer: who is this request. A sign-in exchanges a username
  and a password for an HttpOnly cookie, and every later request is judged by
  that cookie alone. Refusals are deliberately uninformative — a wrong password,
  an unknown account and a disabled account must not be tellable apart until the
  password itself is proven — and every state-changing call has to carry the
  header a cross-site form cannot forge, checked before the password is read.

  What a person is allowed to SEE is decided elsewhere (02-authorization); this
  phase only settles who they are and how long that stays true.

  This phase is a backfill: every scenario is bound to the same entry points
  services/identity's own vitest suites use — the real `identityPlugin` reached
  through `app.inject()`, on a database built from the real migrations, with the
  published demo passwords. Nothing here claims anything about departments.

  Scenario: The capability stands up on a bare server of its own
    Given an identity plugin bound to its own freshly migrated database
    When the identity plugin is registered on a bare server and that server becomes ready
    Then the "requireSession" plugin is visible on the parent server instance
    And a sign-in on that bare server names the person "mock-user-1"

  Scenario: A signed-in person gets a cookie the page's own scripts cannot read
    Given an identity server seeded with the demo accounts
    When "demo-user" signs in with password "demo-pass-123"
    Then the sign-in identifies the person as "mock-user-1" in department "資訊部"
    And the session cookie is HttpOnly, SameSite=Lax and scoped to the whole site
    And the sign-in response never carries the session token

  Scenario Outline: A refused sign-in tells the caller only what they are entitled to know
    Given an identity server seeded with the demo accounts
    When "<username>" signs in with password "<password>"
    Then the response status is <status>
    And the response error code is "<code>"
    And no session cookie is issued

    Examples:
      | username       | password      | status | code                |
      | demo-user      | wrong-pass    | 401    | INVALID_CREDENTIALS |
      | no-such-person | demo-pass-123 | 401    | INVALID_CREDENTIALS |
      | disabled       | demo-pass-123 | 403    | ACCOUNT_DISABLED    |
      | disabled       | wrong-pass    | 401    | INVALID_CREDENTIALS |

  Scenario: The session behind a cookie names the same person who signed in
    Given an identity server seeded with the demo accounts
    And the person "demo-auditor" has signed in with password "demo-pass-123"
    When the session behind that cookie is looked up
    Then the session names the person "mock-user-auditor" with role "auditor"

  Scenario: Signing out kills the session itself, not just the browser's copy
    Given an identity server seeded with the demo accounts
    And the person "demo-user" has signed in with password "demo-pass-123"
    When the signed-in person signs out
    Then the old session cookie no longer names anybody
    And the response status is 204

  Scenario: A hand-edited session cookie is refused and wiped, never repaired
    Given an identity server seeded with the demo accounts
    When a tampered session cookie is presented to the session endpoint
    Then the response error code is "UNAUTHENTICATED"
    And the response status is 401
    And the refusal clears the session cookie

  Scenario: A sign-in without the browser-only header dies before the password is read
    Given an identity server seeded with the demo accounts
    When "demo-user" signs in with password "demo-pass-123" without the CSRF header
    Then no sign-in attempt is recorded in the identity database
    And no session cookie is issued
    And the response status is 403
    And the response error code is "CSRF_HEADER_MISSING"

  Scenario: A forged sign-out cannot log the victim out
    Given an identity server seeded with the demo accounts
    And the person "demo-user" has signed in with password "demo-pass-123"
    When a sign-out without the CSRF header is attempted with that session cookie
    Then the session behind that cookie still names "mock-user-1"
    And the response status is 403
    And the response error code is "CSRF_HEADER_MISSING"

  Scenario: Sandbox mode gives every sign-in its own data owner and seeds exactly that owner
    Given an identity server in sandbox mode with a recording sandbox seeder
    When "demo-user" signs in twice with password "demo-pass-123"
    Then the two sign-ins get different sandbox owner keys
    And the sandbox seeder ran once for each sign-in's own owner key

  Scenario: Without sandbox mode a person owns their real data and nothing is seeded
    Given an identity server with a recording sandbox seeder and sandbox mode switched off
    When "demo-user" signs in with password "demo-pass-123"
    Then the session's data owner key is exactly "mock-user-1"
    And the sandbox seeder never ran
