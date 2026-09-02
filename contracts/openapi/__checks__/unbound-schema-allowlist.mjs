#!/usr/bin/env node
/**
 * Explicit allowlist of contract schemas that `binding-coverage.mjs` finds
 * UNBOUND (none of BOUND-L0, BOUND-L2, TRANSCRIBED, or BOUND-VIA-PARENT
 * apply — see binding-coverage.mjs's header for what each of those means)
 * but that are known, escalated gaps rather than oversights.
 *
 * This is the ONLY thing that keeps an UNBOUND schema from failing
 * `pnpm contract-gate` (see run-gate.mjs). STRUCTURED BY CLASS, not one
 * entry per schema (2026-09-02 correction) — the classes below were
 * measured, not guessed, against the real 2026-09-02 repo state; the exact
 * schema count they cover is printed by run-gate.mjs on every run and MAY
 * ONLY GO DOWN over time (a class whose `schemas` list is edited to ADD an
 * entry, or whose `match()` starts matching something new, needs a real
 * reason — see "Adding to this file" below).
 *
 * Every entry carries:
 *   - `class`      short id, used in the printed report.
 *   - `match(yaml, schema)`  which (yaml, schema) pairs this entry covers.
 *   - `reason`     why no binding exists today.
 *   - `escalation` where the gap is tracked for someone with the authority
 *                  to close it.
 *   - `unlock`     the CONCRETE event that removes this entry, in words a
 *                  reader can judge — never a bare TODO. An entry that is
 *                  not realistically closeable says so explicitly:
 *                  `permanent, reason: …`.
 *
 * ADDING TO THIS FILE: a newly-found UNBOUND schema is a finding to report
 * to the story's reviewer/user, not a line to add here to get back to
 * green. Only add an entry — to an existing class if it genuinely fits, to
 * a new class otherwise — after real triage, with a real reason, escalation
 * and unlock condition. Never add one just because `pnpm contract-gate`
 * reports it UNBOUND.
 */

const BODY_SUFFIX = /Body$/;
const ERROR_ENVELOPE_YAMLS = new Set([
  "analytics.yaml",
  "auth.yaml",
  "conversations.yaml",
  "embedding.yaml",
  "generation.yaml",
]);

export const UNBOUND_SCHEMA_ALLOWLIST = [
  {
    class: "contract-no-compat-file:core",
    match: (yaml) => yaml === "core.yaml",
    reason:
      "core.yaml has no *-compat.ts at all. Its two schemas (Error, Pagination) " +
      "are the platform-wide envelope every other contract $refs — nobody has " +
      "written a compat file that binds them to a shared implementation type.",
    escalation: "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half)",
    unlock:
      "a core-compat.ts is added binding Error/Pagination to whatever shared " +
      "response-envelope type the routes actually construct (see class " +
      "'error-envelope-self-check-only' below for why that type does not " +
      "exist today either) — this is contract-level work, not schema-level, " +
      "and belongs to whoever owns the codegen/drift-gate wiring (README.md's " +
      "own 'Not yet wired into CI' history names E03-S034 for the adjacent " +
      "gap; core.yaml's compat file was never assigned to anyone).",
  },
  {
    class: "contract-no-compat-file:transcriptions",
    match: (yaml) => yaml === "transcriptions.yaml",
    reason:
      "transcriptions.yaml (frozen by E12-S029) has no *-compat.ts, and its " +
      "one route (services/model-gateway/src/routes/transcriptions.ts, " +
      "POST /v1/transcriptions) does ZERO Fastify schema validation of any " +
      "kind — checked directly: no `schema:` route option, no `getSchema()` " +
      "call, no hand-written schema literal. The route parses multipart/" +
      "form-data by hand (extracting the audio field itself) and replies with " +
      "hand-built objects on every branch, so there is neither an L0, L2, nor " +
      "TRANSCRIBED mechanism for any of this contract's 12 schemas to attach " +
      "to. This is the 'check first whether its routes do runtime validation' " +
      "case explicitly considered and ruled out (2026-09-02).",
    escalation: "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half)",
    unlock:
      "either a transcriptions-compat.ts is added (L0), or the route starts " +
      "registering a `schema:` option (L2) or a transcribed literal for at " +
      "least the request/response bodies — whichever a domain owner picks, " +
      "the route currently has none of the three.",
  },
  {
    class: "bindable-not-yet-bound",
    match: (yaml, schema) => yaml === "auth.yaml" && schema === "LoginRequest",
    reason:
      "NOT a permanent gap, unlike the classes above — a real implementation " +
      "type already exists, it is just never referenced by auth-compat.ts. " +
      "packages/auth-client/src/index.ts's AuthClient.login only takes an " +
      "INLINE anonymous `{ username, password }` parameter today — binding it " +
      "needs that type named and exported first, a Team-A-owned one-line " +
      "change (auth-client is not a Team B folder), not a cross-team " +
      "escalation. This class used to also cover generation.yaml's " +
      "GenerationRequest/ContextChunk and analytics.yaml's UsageMetrics/" +
      "LatencyMetrics/FeedbackQueuePage — E04-S080 bound all five (each " +
      "already had a real implementation type sitting unused, the same " +
      "situation this entry still describes for LoginRequest) and removed " +
      "them from this match(); LoginRequest is the only one left because it " +
      "additionally needs a one-line export before it can be bound, which was " +
      "out of E04-S080's scope. `UsageEventCreated`, the sixth original " +
      "member, turned out to have NO implementation type at all (see the " +
      "`response-literal-no-exported-type` class below) and does not belong " +
      "in this class even after triage.",
    escalation: "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half); E04-S080 row (2026-09-03) for the narrowing",
    unlock:
      "someone names and exports that inline `{ username, password }` " +
      "parameter type in packages/auth-client, then binds it in " +
      "auth-compat.ts with an AssignableTo/Exact check — no contract or " +
      "service change required.",
  },
  {
    class: "response-literal-no-exported-type",
    match: (yaml, schema) => yaml === "analytics.yaml" && schema === "UsageEventCreated",
    reason:
      "Triaged out of `bindable-not-yet-bound` (E04-S080), unlike its five " +
      "former classmates there, which all had a real implementation type " +
      "sitting unused and got bound. This one genuinely has none: `POST " +
      "/usage-events` (services/feedback/src/routes/usage-events.ts) builds " +
      "its 201 response as a bare inline object literal — `return { id }` — " +
      "where `id = randomUUID()` is plain `string`, never narrowed to the " +
      "contract's `format: uuid`, and there is no local interface, type " +
      "alias, or import anywhere in that route file naming this shape. " +
      "Exporting one would mean adding a type (or a named return type) to " +
      "services/feedback — a Team B folder outside this story's " +
      "contracts/openapi/__checks__/-only scope — and per this repo's own " +
      "rule, inventing/exporting a Team B type solely to make a schema " +
      "bindable is not a workaround this story is allowed to take.",
    escalation: "docs/stories/PROGRESS.md E04-S080 row (2026-09-03)",
    unlock:
      "a domain owner adds a named, exported response type for POST " +
      "/usage-events' 201 body in services/feedback and returns it by that " +
      "name instead of an inline literal — only then does an " +
      "analytics-compat.ts binding become possible.",
  },
  {
    class: "event-schema-no-provider-type",
    match: (yaml, schema) => yaml === "conversations.yaml" && (schema === "ChangeEvent" || schema === "ResyncEvent"),
    reason:
      "ChangeEvent: registerChangeEventRoutes (services/conversation/src/" +
      "routes/change-events.ts) serialises a private, unexported " +
      "toWirePayload() object literal for the SSE wire payload, not the " +
      "exported ChangeEventRow repository type — they differ in the one " +
      "field that matters (`seq` on the row vs. `id` on the wire). " +
      "ResyncEvent is the same route file's OTHER SSE event " +
      "(`res.write(\\`event: resync\\ndata: ${JSON.stringify({ reason: ... " +
      "})}\\n\\n\\`)`) — an inline object literal with no exported type at " +
      "all, not even a private one. Binding either requires adding a " +
      "type-only export from services/conversation, a Team B folder outside " +
      "this story's contracts/openapi/__checks__/-only scope.",
    escalation:
      "conversations-compat.ts's own 'UNBINDABLE, RECORDED RATHER THAN " +
      "FAKED' header comment (ChangeEvent); docs/stories/PROGRESS.md " +
      "E04-S065 row (2026-09-02, back half) for both",
    unlock:
      "pending user authorization for a one-line type-only export from " +
      "services/conversation naming the SSE wire shape for ChangeEvent and/or " +
      "ResyncEvent.",
  },
  {
    class: "unimplemented-route",
    match: (yaml, schema) =>
      yaml === "analytics.yaml" &&
      ["SystemHealth", "Subsystem", "SubsystemStatus", "SubsystemName"].includes(schema),
    reason:
      "GET /admin/health (analytics.yaml) has no route implementation at all " +
      "anywhere in services/feedback (checked: services/feedback/src/routes/ " +
      "has admin-feedback.ts, admin-metrics.ts, usage-events.ts — no health " +
      "route). There is no implementation type of any kind to bind these four " +
      "schemas against, because there is no implementation.",
    escalation: "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half)",
    unlock:
      "GET /admin/health is implemented (in services/feedback or wherever a " +
      "domain owner decides system-health aggregation belongs) and exports a " +
      "response type; only then does binding it become possible.",
  },
  {
    class: "error-envelope-self-check-only",
    match: (yaml, schema) => ERROR_ENVELOPE_YAMLS.has(yaml) && BODY_SUFFIX.test(schema),
    reason:
      "Every *Body/*ErrorBody schema across these five contracts is the same " +
      "ADR-0003 flat envelope ({code, message, details?}); every route sends " +
      "it as an inline object literal at the `reply.code(4xx).send({...})` " +
      "call site, not through any shared, named, exported error-response " +
      "type. FlatEnvelope/Exact<...,\"CODE\"> self-checks already assert the " +
      "envelope shape and the literal status code against the CONTRACT alone " +
      "(real, meaningful checks) — there is simply no implementation-side " +
      "type for these to be compared against, because none exists.",
    escalation: "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half)",
    unlock:
      "a shared, exported error-response-body type is introduced (e.g. in " +
      "packages/types) that routes actually construct their error replies " +
      "from instead of an inline literal, and each yaml's *Body/*ErrorBody " +
      "schema is bound against it. Not permanent — achievable without any " +
      "contract change — just not scoped to this story (touching every " +
      "route's reply call sites is far outside contracts/openapi/__checks__/).",
  },
];
