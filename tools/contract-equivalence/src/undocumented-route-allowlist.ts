/**
 * Explicit allowlist of routes that `build-report.ts`'s `buildReport`
 * hits in its `if (!operation)` branch — a route the live server actually
 * registers, for which NO yaml operation matches by path+method in any
 * loaded contract (`RouteReport.status === "ABSENT"` with `operationId`
 * undefined; see `undocumented-routes.ts` for how this is picked back out
 * of a `BuildReportResult`) — but that is a known, escalated gap rather
 * than an oversight.
 *
 * Modelled on `contracts/openapi/__checks__/unbound-schema-allowlist.mjs`:
 * same shape (reason / escalation / unlock), same rule (no bare TODOs, a
 * permanent entry says so explicitly in words), same discipline (this is
 * the ONLY thing that keeps an undocumented route from failing
 * `check.live.test.ts`'s "no undocumented routes" assertion — see
 * `undocumented-routes.ts`). The exempt count MAY ONLY GO DOWN over time.
 *
 * WHAT THIS IS NOT FOR: a route whose yaml operation exists but whose
 * runtime schema DIVERGES from it. That is a different failure mode
 * (`RouteReport.status === "DIVERGES"`, `operationId` IS set) with its own
 * rule, unchanged by this story: a real DIVERGES may never enter any
 * allowlist (see README.md "Why this is not part of any gate" and this
 * story's own landing constraints in PROGRESS.md's E04-S078 row). If an
 * entry here would actually be covering a DIVERGES, stop and report —
 * do not add it.
 *
 * ADDING TO THIS FILE: a newly-found undocumented route is a finding to
 * report to the user, not a line to add here to get back to green. Only
 * add an entry after real triage, with a real reason, escalation and
 * unlock condition — never just because the check reports it.
 */

export interface UndocumentedRouteEntry {
  /**
   * "METHOD /path", exactly as `RouteReport.key` prints it — i.e. the raw
   * Fastify method + url the live server registered (`/v1` prefix
   * included, Fastify's own `:param` syntax for any path parameter, NOT
   * the OpenAPI-normalised `routeKeyToString` form used for yaml-side
   * matching). See `undocumented-routes.ts`'s `isExempt`.
   */
  readonly route: string;
  /** Why no yaml operation exists for this route today. A human must be able to judge this, not just parse it. */
  readonly reason: string;
  /** Where the gap is tracked for someone with the authority to close it. */
  readonly escalation: string;
  /**
   * The CONCRETE event that removes this entry, in words a reader can
   * judge — never a bare TODO. An entry that is not realistically
   * closeable says so explicitly: `permanent, reason: …`.
   */
  readonly unlock: string;
}

export const UNDOCUMENTED_ROUTE_ALLOWLIST: UndocumentedRouteEntry[] = [
  {
    route: "GET /v1/health",
    reason:
      "Exists in no contract at all — verified: the only health path in any " +
      "loaded yaml is analytics.yaml's GET /admin/health, a distinct route " +
      "(different path, different auth posture, see apps/api/src/server.ts's " +
      "own comment at its registration site). Found by E04-S073's L2-EQ " +
      "checking its reverse direction (server routes with no yaml operation, " +
      "as opposed to the yaml-operations-with-no-route direction it already " +
      "reported) — this was the only hit in the whole app. Two resolutions " +
      "are open and BOTH require the user's decision, not this tool's or any " +
      "agent's: (a) add GET /v1/health to a contract (a contract change — " +
      "CLAUDE.md 鐵律 #1, needs the user before any yaml is touched), or " +
      "(b) declare it deliberately internal/out-of-contract (an unauthenticated " +
      "liveness probe, unlike /admin/health's role-gated system-status " +
      "endpoint) and keep it off the public contract permanently. This entry " +
      "exists because that decision is still pending — it is not a vote for " +
      "(b), and it must not be read as one.",
    escalation: "docs/stories/PROGRESS.md E04-S078 row; docs/stories/E04-S078.md",
    unlock:
      "the user picks (a) or (b). (a): a contracts/openapi/*.yaml gains a " +
      "GET /v1/health (or /health, per servers.url) operation — at that " +
      "point this route is no longer undocumented and this entry is deleted, " +
      "not edited. (b): the user confirms it as intentionally internal and " +
      "out of the public contract — at that point this entry's `reason` is " +
      "rewritten to record that decision as settled (no longer 'pending') " +
      "and, since an intentionally-uncontracted internal route does not stop " +
      "being intentional later on its own, reworded to read `permanent, " +
      "reason: <the user's stated rationale>`. Until either happens this " +
      "entry stays exactly as pending, not silently treated as either answer.",
  },
];
