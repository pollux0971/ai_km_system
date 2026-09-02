import { formatDiffEntry } from "./normalize.js";
import type { BuildReportResult, RouteReport } from "./build-report.js";

function printField(field: import("./build-report.js").FieldResult): void {
  console.log(`    ${field.field}: ${field.status}${field.note ? ` — ${field.note}` : ""}`);
  if (field.diff) {
    for (const entry of field.diff) console.log(formatDiffEntry(entry));
  }
}

function printRoute(route: RouteReport): void {
  const tag = `[${route.status}]`.padEnd(11);
  const suffix = route.operationId ? `  (${route.operationId}${route.yamlFile ? `, ${route.yamlFile}` : ""})` : "";
  console.log(`${tag}${route.key}${suffix}`);
  if (route.note) console.log(`    ${route.note}`);
  if (route.requestFields.length === 0 && !route.note) {
    console.log("    (nothing to compare on either side — no body/querystring/params schema declared)");
  }
  for (const field of route.requestFields) printField(field);
  // Informational only — never contributes to `route.status`. See
  // RouteReport.responseFields doc for why.
  for (const field of route.responseFields) printField(field);
}

export function printFullReport(result: BuildReportResult): void {
  const all = [...result.routes, ...result.unmatchedOperations];
  const byStatus = { MATCH: 0, DIVERGES: 0, ABSENT: 0 } as Record<string, number>;
  for (const r of all) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;

  console.log("=".repeat(78));
  console.log("L2-EQ contract-equivalence report (E04-S073)");
  console.log("=".repeat(78));
  console.log();
  console.log("── Registered routes (matched against a yaml operation, or not) ──");
  for (const route of result.routes) printRoute(route);

  console.log();
  console.log("── Yaml operations with no matching registered route ──");
  if (result.unmatchedOperations.length === 0) {
    console.log("  none");
  } else {
    for (const op of result.unmatchedOperations) printRoute(op);
  }

  console.log();
  console.log(
    `SUMMARY: ${all.length} total — MATCH=${byStatus.MATCH ?? 0}  DIVERGES=${byStatus.DIVERGES ?? 0}  ABSENT=${byStatus.ABSENT ?? 0}`,
  );
}

export function divergedRoutes(result: BuildReportResult): RouteReport[] {
  return [...result.routes, ...result.unmatchedOperations].filter((r) => r.status === "DIVERGES");
}
