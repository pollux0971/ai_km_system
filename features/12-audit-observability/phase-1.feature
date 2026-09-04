@i1 @audit-observability @phase-1 @standalone
Feature: The system can be watched from outside without opening anyone's data
  Operating this platform means two different people asking two different
  questions. Anyone at all — a load balancer, a deploy script, a person with
  no account — may ask "is it up?" and gets an answer that names nothing
  about the machine behind it. Someone holding an operator role may ask
  "what exactly is wrong?" and gets the four subsystems by name. Between
  those two, every request carries a trace id so one person's action can be
  followed through the log, and the log itself never writes down a cookie, a
  bearer token or a password.

  This phase is a backfill: every scenario is driven through the same real
  server the package's own vitest tests drive (`buildServer()` + `inject()`),
  with the speech sidecar answered by the in-process fake. See FEATURE.md
  「回填對照表」. There is no `services/audit` — the audit trail itself is
  phase-3 material, and this folder does not pretend otherwise.

  Background:
    Given an api whose subsystems are all healthy, with its own log captured

  Scenario: The capability answers an operator before anybody has signed in
    When a "GET" request is sent to "/v1/health"
    Then the health summary reports the system as "ok"
    And the response status is 200

  Scenario: The public summary tells an anonymous caller nothing about the machine behind it
    When a "GET" request is sent to "/v1/health"
    Then the health summary carries only the status, the version and the uptime
    And the health summary names no file path, no environment variable and no subsystem

  Scenario: A subsystem falling over shows up as degraded while the endpoint operators poll stays reachable
    Given the database connection behind the health check has been closed
    When a "GET" request is sent to "/v1/health"
    Then the health summary reports the system as "degraded"
    And the response status is 200

  Scenario: One action can be followed through the log by the trace id its caller chose
    When a health check is requested carrying the trace id "trace-42"
    Then the response carries back the trace id "trace-42"
    And the log lines written for that request carry the trace id "trace-42"

  Scenario: A trace id shaped to forge a log line is thrown away instead of written down
    When a health check is requested carrying the trace id "trace-42 level=fatal msg=owned"
    Then the response does not carry back the trace id "trace-42 level=fatal msg=owned"
    And no log line written for that request carries the trace id "trace-42 level=fatal msg=owned"
    And the response carries a freshly minted trace id instead

  Scenario: Signing in with a password never leaves the password, the cookie or the bearer token in the log
    When someone signs in sending the password "super-secret-password", the cookie "super-secret-cookie" and the bearer token "super-secret-bearer"
    Then the log records that the sign-in was attempted
    And no log line quotes "super-secret-password"
    And no log line quotes "super-secret-cookie"
    And no log line quotes "super-secret-bearer"

  Scenario: Nobody reads the detailed report without signing in first
    When a "GET" request is sent to "/v1/admin/health"
    Then the detailed health report is withheld
    And the response status is 401

  Scenario: Someone signed in without an operator role is refused the detailed report
    Given the person signed in for a health check is "demo-user"
    When the signed-in person asks for the detailed health report
    Then the detailed health report is withheld
    And the response status is 403

  Scenario: An IT administrator is shown every subsystem by name
    Given the person signed in for a health check is "demo-it"
    When the signed-in person asks for the detailed health report
    Then the detailed health report names the subsystems "api, asr, database, migrations"
    And the response status is 200
