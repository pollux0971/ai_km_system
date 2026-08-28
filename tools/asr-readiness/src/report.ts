/**
 * Shared three-state report shape for `check-asr`/`verify-asr` (E12-S030
 * UX Acceptance: "CLI 三態訊息繁體中文,缺檔訊息含可直接照做的下一步").
 */

export type ReadinessLevel = "ready" | "degraded" | "not_ready";

export interface ReadinessReport {
  readonly level: ReadinessLevel;
  readonly summary: string;
  readonly details: readonly string[];
  readonly nextSteps: readonly string[];
}

const ICON_FOR_LEVEL: Record<ReadinessLevel, string> = {
  ready: "✅",
  degraded: "⚠️",
  not_ready: "❌",
};

/** Exit code convention: 0 only for "ready"; both other levels are non-zero (AC3). */
export function exitCodeForLevel(level: ReadinessLevel): number {
  return level === "ready" ? 0 : 1;
}

export function formatReport(report: ReadinessReport): string {
  const lines = [`${ICON_FOR_LEVEL[report.level]} ${report.summary}`];
  for (const detail of report.details) lines.push(`  - ${detail}`);
  if (report.nextSteps.length > 0) {
    lines.push("下一步:");
    for (const step of report.nextSteps) lines.push(`  → ${step}`);
  }
  return lines.join("\n");
}
