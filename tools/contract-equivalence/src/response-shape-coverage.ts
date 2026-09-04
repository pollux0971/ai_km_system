/**
 * E04-S073 follow-up ("gate-response-shape", 2026-09-03) — the honest
 * denominator for the response-shape coverage report.
 *
 * `check-response-shapes.live.test.ts` (E04-S079) only ever prints how many
 * routes IT exercised, e.g. "21 of 21 exercised routes clean". Read on its
 * own, "N of N" reads as complete coverage — but N is "the ones we hit",
 * and a route the suite never calls is invisible to that fraction, not
 * counted as a zero. This is exactly the mistake the route-schema side of
 * this same tool already made and had to correct: an early report read
 * "MATCH=9 DIVERGES=2" without ever printing that ABSENT=15 routes were not
 * judged at all (see README.md's "Current DIVERGES" / archive/ROADMAP_TEMP.md
 * 5-rho). This module exists so the response-shape report cannot repeat
 * that mistake: it independently enumerates every operation any loaded
 * contract declares a JSON 2xx response for, so a caller can compute
 * `declared - exercised = notCovered` and print the difference by name,
 * not fold it into a fraction.
 *
 * Deliberately narrow: "declared" here means "has an
 * `application/json` schema under some `2xx` response" — the same
 * predicate `check-response-shapes.live.test.ts` itself uses to decide
 * whether a captured response is even comparable (see
 * `check-response-shapes.live.test.ts`'s own module doc, points 3–4, for
 * why a 204-no-body route, an SSE route, and an undocumented route are
 * each excluded from ITS scenario list for a stated reason — this module
 * mirrors that same boundary on the contract side, not a narrower or wider
 * one, so the two sides being subtracted actually measure the same thing).
 */
import type { LoadedSpec } from "./load-contracts.js";
import { buildYamlIndex, responseJsonSchema, twoXxStatuses } from "./yaml-index.js";

/**
 * Every `"METHOD /path"` operation, across every loaded contract, that
 * declares at least one `application/json` 2xx response schema — sorted,
 * deduplicated by construction (one entry per yaml-index key).
 */
export function declaredJsonTwoXxOperations(specs: readonly LoadedSpec[]): string[] {
  const index = buildYamlIndex(specs);
  const declared: string[] = [];
  for (const [key, operation] of index) {
    const hasJsonTwoXx = twoXxStatuses(operation).some((status) => responseJsonSchema(operation, status) !== undefined);
    if (hasJsonTwoXx) declared.push(key);
  }
  return declared.sort();
}

export interface ResponseShapeCoverage {
  /** Every declared JSON 2xx operation, sorted. */
  readonly declared: readonly string[];
  /** The subset of `declared` this run actually captured and diffed. */
  readonly exercised: readonly string[];
  /** `declared` minus `exercised`, sorted — printed by name, never hidden inside a fraction. */
  readonly notCovered: readonly string[];
}

/**
 * `exercisedKeys` is whatever the caller's own scenario run actually
 * captured (a `Set` so duplicates collapse before the subtraction below —
 * two captures of the same route+method are still one "covered" entry).
 */
export function computeResponseShapeCoverage(
  specs: readonly LoadedSpec[],
  exercisedKeys: ReadonlySet<string>,
): ResponseShapeCoverage {
  const declared = declaredJsonTwoXxOperations(specs);
  const exercised = declared.filter((key) => exercisedKeys.has(key));
  const notCovered = declared.filter((key) => !exercisedKeys.has(key));
  return { declared, exercised, notCovered };
}
