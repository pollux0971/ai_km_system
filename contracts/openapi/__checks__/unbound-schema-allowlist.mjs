#!/usr/bin/env node
/**
 * Explicit allowlist of contract schemas that `binding-coverage.mjs` finds
 * UNBOUND (no `*-compat.ts` assertion ties them to a real implementation
 * type) but that are known, escalated gaps rather than oversights.
 *
 * This list is the ONLY thing that keeps an UNBOUND schema from failing
 * `pnpm contract-gate` (see run-gate.mjs). Every entry must carry a `reason`
 * (why no binding exists) and an `escalation` (where the gap is tracked for
 * someone with the authority to close it). Adding an entry here to make the
 * gate pass without a real reason and a real escalation defeats the entire
 * point of this check — see run-gate.mjs's own header and
 * docs/stories/PROGRESS.md's E04-S065 row for why it exists.
 *
 * Do NOT add an entry here just because `pnpm contract-gate` reports it
 * UNBOUND. A newly-found unbound schema is a finding to report to the
 * story's reviewer/user, not a line to add here to get back to green.
 */
export const UNBOUND_SCHEMA_ALLOWLIST = [
  {
    yaml: "conversations.yaml",
    schema: "ChangeEvent",
    reason:
      "No exported provider type to bind against: registerChangeEventRoutes " +
      "(services/conversation/src/routes/change-events.ts) serialises a " +
      "private, unexported toWirePayload() object literal for the SSE wire " +
      "payload, not the exported ChangeEventRow repository type — the two " +
      "differ in the one field that matters (`seq` on the row vs. `id` on " +
      "the wire). Binding this schema would require adding a type-only " +
      "export from services/conversation, a Team B folder outside this " +
      "story's contracts/openapi/__checks__/-only scope.",
    escalation:
      "docs/stories/PROGRESS.md E04-S065 row (2026-09-02) and " +
      "contracts/openapi/__checks__/conversations-compat.ts's own " +
      "'UNBINDABLE, RECORDED RATHER THAN FAKED' header comment; pending " +
      "user authorization for the one-line type-only export from " +
      "services/conversation.",
  },
];
