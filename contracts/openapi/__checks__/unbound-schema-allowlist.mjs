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
 *
 * REMOVING FROM THIS FILE (2026-09-03, E04-S084): once every schema a class's
 * `match()` used to cover is bound, DELETE the entry — do not keep it as a
 * documented empty placeholder ("this class is EMPTY now, kept for the
 * record"). run-gate.mjs's Check 3b runs every entry's `match()` against
 * every schema this run classified UNBOUND and fails the whole gate if an
 * entry matches none of them, specifically so this file cannot silently
 * carry a dead entry indistinguishable from a real, live gap. A class kept
 * empty on purpose would make `pnpm contract-gate` permanently red under
 * that check — it was tried here (the former `bindable-not-yet-bound`
 * class, hardcoded to `match: () => false`) and removed for exactly this
 * reason. Its provenance is not lost: see git blame/log on this file and
 * docs/stories/PROGRESS.md's E04-S065/E04-S076/E04-S080 rows.
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
  // "bindable-not-yet-bound" (E04-S065/E04-S076/E04-S080) removed here, 2026-09-03
  // (E04-S084): it had gone EMPTY — match() hardcoded to '() => false', every
  // member since bound or triaged elsewhere — and was being kept only as a
  // documented placeholder instead of deleted. That is exactly the shape this
  // story exists to catch: run-gate.mjs Check 3b now fails the gate on any entry
  // whose match() matches zero UNBOUND schemas, so a placeholder entry that can
  // never match anything would make 'pnpm contract-gate' permanently red. The
  // provenance this entry used to preserve in prose is not lost: it lives in git
  // blame/log for this file and in docs/stories/PROGRESS.md's E04-S065/S076/S080
  // rows. An entry that reaches zero UNBOUND matches must be REMOVED going
  // forward, not kept empty for the record.
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
    match: (yaml, schema) => yaml === "conversations.yaml" && schema === "ResyncEvent",
    reason:
      "ResyncEvent is services/conversation/src/routes/change-events.ts's " +
      "OTHER SSE event (`res.write(\\`event: resync\\ndata: " +
      "${JSON.stringify({ reason: ... })}\\n\\n\\`)`, three call sites) — " +
      "each an inline object literal with no exported type at all, not even " +
      "a private one, so there is no single named type to bind against. " +
      "(ChangeEvent, formerly in this same class, was bound by E04-S072 " +
      "— option (d), user-approved 2026-09-03 — once the sibling event, " +
      "`toWirePayload`, gained a real named return type; ResyncEvent has no " +
      "such function to name.)",
    escalation:
      "docs/stories/PROGRESS.md E04-S065 row (2026-09-02, back half); " +
      "E04-S072 row (2026-09-03) for ChangeEvent's removal from this class",
    unlock:
      "pending user authorization for either a type-only export naming " +
      "ResyncEvent's wire shape, or refactoring the three inline " +
      "`res.write` call sites to share one named serializer function first.",
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
