@i3 @authorization @phase-2
# PROPOSAL — this file is a test agent's proposal on branch
# pollux0971/authz-phase2. Per GHERKIN_WORKFLOW §6 a `.feature` is only
# changed by the user or through a confirmed `/feature` flow; this is that
# proposal, waiting for the coordinator to route it to the technical
# advisor before it can be merged. Do not treat it as accepted spec yet.
#
# Most scenarios below are expected to be RED. Nothing that turns a
# signed-in identity into a `RetrievalScope` exists yet — that is exactly
# what this phase is scoped to build (E04-S009, now ruled by ADR 0012,
# 2026-09-04). None of the steps below import or reference a new
# production symbol (checked: only `toRetrievalScope`, `buildScopePredicate`
# and `buildScopeSql` from phase-1 are used), so every failing scenario
# fails at an ASSERTION, never at compile time — `pnpm typecheck` /
# `pnpm lint` stay green throughout this file.
#
# The technique: build the scope the ONLY way today's code allows — pass
# identity's raw session fields (department/group DISPLAY NAMES, e.g.
# "資訊部") straight into the existing `toRetrievalScope()` as if they were
# scope keys — and then assert the CORRECT, ADR-0012-compliant outcome
# (the canonical `dept:<id>` / `group:<id>` key is admitted). It never is,
# today, because there is no translation layer. That gap — not a made-up
# assertion — IS the red.
#
# phase-2b's four deny scenarios (below the Scenario Outline) started out
# mixing red and green on purpose: "An explicit denial on an allowed
# department …" and "A denied department does not reach the database's IN
# list …" asserted the ADR-0012-ruling-4 outcome before `RetrievalScope`
# had a field to produce it. "Denying a department nobody was ever granted
# …" and "An empty explicit-denial list …" were GREEN from the start — they
# document invariants that already held before the change (a denial cannot
# widen access, and an empty denial list changes nothing) and that
# phase-2b's implementation must not break. A second round (dev agent)
# implemented `deniedScopeKeys` in `scope.ts`; a third round (test agent,
# same day) wired the `Given`/`When` steps below to actually pass the
# scenario's denied list into `toRetrievalScope()` — before that wiring, no
# implementation of `scope.ts` could have turned the first two scenarios
# green, because the denied value never reached the function under test.
# All four scenarios are green now; the wording of the first two was
# rewritten from describing the gap ("but it does not" / "but it does") to
# describing the behaviour, same technique the phase-1 `@design-constraint`
# note above documents for scenarios that outlive their own red phase.
Feature: A person's department and group become a retrieval scope, derived from their signed-in identity alone
  ADR 0012 (2026-09-04) ruled the five open questions E04-S009 was blocked
  on: scope keys are shaped `dept:<department.id>` / `group:<group.id>` and
  a display name is never a key; the department↔key mapping is owned and
  maintained solely by 01-identity, 02-authorization only reads it (no
  second table, per E04-S062's ban on a transitional mapping); a person's
  allowed keys are the UNION of their department and their group(s), never
  an intersection; Deny-Wins acts on an explicit ACL deny, which overrides
  a grant rather than merely narrowing one; and a document carries exactly
  one scopeKey, so moving it between departments makes it invisible from
  the old one and visible from the new one (this last point needs no new
  work — phase-1's `buildScopePredicate` / `assertNoScopeLeak` already
  enforce single-key exact-match Deny-Wins; a moved document is just a
  changed `scopeKey` value, already covered).

  These rulings fix the SHAPE of the answer, not the DATA it needs. Today
  `db/migrations/202608280002_identity.sql`'s `users` table has exactly
  `department TEXT` and `group_name TEXT` — free-form display-name
  columns. There is no `department.id` or `group.id` anywhere in this
  repository (checked by grep, not assumed): no id column, no
  departments/groups lookup table, nothing for 01-identity to hand over
  yet that phase-2 could read. So the scenarios below cannot use real
  canonical scopeKey values (nobody has decided what `資訊部` maps to —
  "it"? a UUID? something else?) — the `dept:it` / `group:general` keys
  they reference are ILLUSTRATIVE PLACEHOLDERS standing in for "whatever
  01-identity eventually maintains", not a claim about the real mapping.
  That the mapping DATA does not exist yet is itself a finding of this
  round, reported back to the coordinator.

  A person able to do something is what these scenarios are about, not a
  function's return value: someone signed in today, with only the
  department/group names identity already gives out, still cannot open
  even their OWN department's or group's document — not because they are
  denied, but because nothing yet turns their name-shaped identity into a
  key-shaped scope. That is a silent "查無資料", the too-narrow failure
  this folder's phase-1 warns about. And separately: a person explicitly
  blocked from one department by an ACL entry would, under today's
  grants-only mechanism, still be admitted — the too-wide failure, because
  `toRetrievalScope()` has no field to carry an explicit deny at all yet.

  This is deliberately NOT the same scenario as phase-1's
  `@design-constraint` one (`A signed-in identity already names a
  department, and hands over no ready-made scope keys`), which is a
  narrower claim: identity's HTTP response carries no scope-shaped field.
  That claim stays true forever — derivation belongs in-process, on the
  server, never delivered to a client to be trusted back (fail closed,
  鐵律 #2) — so once phase-2 lands, that scenario is REWRITTEN (never
  deleted, see phase-1.feature's comment above it and this folder's
  FEATURE.md) to assert exactly that: the session response still carries
  no `scope`/`scopeKeys`/`allowedScopeKeys` field even after a derivation
  function exists elsewhere, because the derivation is meant to live
  in-process inside the authorization/retrieval layer, not to be exposed
  over HTTP for a caller to hand back. This file does not duplicate that
  assertion (it would fail `pnpm gherkin:dup`); it only records the plan.

  Scenario Outline: A person's own department or group, named the way identity names it today, still cannot unlock the matching document
    Given a fresh server with fake providers
    When the authorization layer looks up the signed-in identity of "<username>"
    And that identity's session fields alone are used to attempt an authorization scope
    Then the attempted scope should admit a record labelled "<canonicalKey>" but does not

    Examples:
      | username         | canonicalKey        |
      | demo-user        | dept:it             |
      | demo-user        | group:general       |
      | demo-maintenance | dept:maintenance    |
      | demo-maintenance | group:maintenance-eng |

  # ── phase-2b(2026-09-04,實作完成 2026-09-04)——————————————————————
  # 技術顧問依 ADR 0012 裁定了 deny 這一題的完整形狀(見 FEATURE.md「phase-2b
  # 提案」段):RetrievalScope 加 deniedScopeKeys(輸出必填、輸入 optional,
  # 理由見 scope.ts 的 toRetrievalScope 注解);
  # buildScopePredicate → allowed.has(k) && !denied.has(k);buildScopeSql
  # 同義,denied 直接不進 IN 清單(前置過濾),並保留既有 post-assert;
  # deny 的來源(ACL 表)不在這一輪,呼叫端此刻全部傳 []、場景用手填的
  # denied。下面四個場景把原本那一條(only "an explicit denial …")拆開,
  # 逐一涵蓋:核心 Deny-Wins、deny 不會意外放寬(記錄不變的底線)、
  # 空 denied 的安全網(保證裁定 4「呼叫端全傳 []」不會集體鎖死)、
  # SQL 層的前置過濾。第二輪(開發 agent)把 scope.ts 接好之後,第三輪
  # (測試 agent)把這四條的 steps 真的接上 deniedScopeKeys——下面前兩條
  # (「An explicit denial …」「A denied department …」)的措辭原本描述的是
  # 「今天做不到」的缺口,現在描述的是實際行為,四條全綠。
  Scenario: An explicit denial on an allowed department overrides that department's grant
    Given a person "u-1" whose grants are exactly "dept:it, group:general"
    And that person has also been explicitly denied "dept:it"
    When that person's authorization scope is built
    Then the scope refuses a record labelled "dept:it" because of the explicit denial
    And the scope admits a record labelled "group:general"

  Scenario: Denying a department nobody was ever granted changes nothing — a denial can only narrow, never widen
    Given a person "u-2" whose grants are exactly "dept:it"
    And that person has also been explicitly denied "dept:finance"
    When that person's authorization scope is built
    Then the scope admits a record labelled "dept:it"
    And the scope refuses a record labelled "dept:finance"

  Scenario: An empty explicit-denial list leaves today's grants-only behaviour untouched
    Given a person "u-3" whose grants are exactly "dept:it, group:general"
    And that person has explicitly denied nothing
    When that person's authorization scope is built
    Then the scope admits a record labelled "dept:it"
    And the scope admits a record labelled "group:general"

  Scenario: A denied department does not reach the database's IN list at all — pre-filter, not filter-after-query
    Given a person "u-4" whose grants are exactly "dept:it, group:general"
    And that person has also been explicitly denied "dept:it"
    When that person's authorization scope is turned into a database filter on "scope_key"
    Then the filter does not include "dept:it" in its parameter list because of the explicit denial
