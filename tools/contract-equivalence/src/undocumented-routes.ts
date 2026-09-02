/**
 * E04-S078 — turns "a route is registered on the live server but no yaml
 * operation matches it" into a checkable, allowlist-gated condition.
 *
 * Before this story, `build-report.ts`'s `if (!operation)` branch already
 * *detected* this case (it pushes a `RouteReport` with `status: "ABSENT"`
 * and no `operationId`), and `print-report.ts` already *printed* it under
 * "Registered routes" — but nothing ever made it FAIL anything:
 * `divergedRoutes` (what `check.live.test.ts`'s first `it` asserts against)
 * only ever looks at `status === "DIVERGES"`, never `"ABSENT"`. An
 * undocumented route was visible in stdout if you scrolled for it and
 * invisible to every assertion. This module is what closes that gap.
 *
 * Scope, precisely: this is the ROUTE-side ABSENT case only
 * (`result.routes`, no `operationId`). It is NOT:
 *   - the YAML-side ABSENT case (`result.unmatchedOperations` — a yaml
 *     operation with no matching route), a different, already-visible,
 *     unrelated finding this story does not touch;
 *   - a DIVERGES (`operationId` IS set, the route matched a yaml operation
 *     but their schemas differ) — DIVERGES may never enter an allowlist,
 *     per this story's own landing constraint; see
 *     `undocumented-route-allowlist.ts`'s module doc.
 */
import type { BuildReportResult, RouteReport } from "./build-report.js";
import { UNDOCUMENTED_ROUTE_ALLOWLIST } from "./undocumented-route-allowlist.js";

/**
 * Every live-registered route with no matching yaml operation, in any
 * loaded contract. A matched route always carries an `operationId` (see
 * `build-report.ts`'s `buildMatchedRouteReport`), so `operationId ===
 * undefined` on an `ABSENT` entry in `result.routes` (as opposed to
 * `result.unmatchedOperations`, untouched here) is exactly and only this
 * case — no string-matching on `note` required.
 */
export function undocumentedRoutes(result: BuildReportResult): RouteReport[] {
  return result.routes.filter((r) => r.status === "ABSENT" && r.operationId === undefined);
}

export interface UndocumentedRouteCheckResult {
  /** Every undocumented route found this run, exempt or not. */
  readonly undocumented: readonly RouteReport[];
  /** Undocumented routes with NO matching exempt entry — these are what fails the check. */
  readonly violations: readonly RouteReport[];
  /** How many exempt entries are currently configured (may only go down over time). */
  readonly exemptCount: number;
}

/**
 * `undocumented \ allowlist`, by exact `RouteReport.key` string match
 * against `UndocumentedRouteEntry.route` (both "METHOD /path" in Fastify's
 * own url syntax — see `undocumented-route-allowlist.ts`'s field doc).
 * Anything left over is a route nobody has explicitly declared, which is
 * exactly the thing this story exists to make loud.
 */
export function checkUndocumentedRoutes(result: BuildReportResult): UndocumentedRouteCheckResult {
  const undocumented = undocumentedRoutes(result);
  const allowlistedKeys = new Set(UNDOCUMENTED_ROUTE_ALLOWLIST.map((e) => e.route));
  const violations = undocumented.filter((r) => !allowlistedKeys.has(r.key));
  return { undocumented, violations, exemptCount: UNDOCUMENTED_ROUTE_ALLOWLIST.length };
}
