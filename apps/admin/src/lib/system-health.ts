import type { ApiError, Result } from "@ai-km/types";

/**
 * E11-S022 "System health dashboard". The two subsystems named below
 * are real, already-approved admin domains (`connectors.ts` / E11-S014,
 * `models.ts` / E11-S013) — not invented. What's genuinely missing is
 * the HEALTH READING for each: `AI_KM_BMAD_High_Granularity/epics/
 * E10_Enterprise_Data_Integration.md`'s own "E10-S04 Connector health
 * check" and `.../E12_Model_&_Prompt_Platform.md`'s own "E12-S005
 * Model health/status" (both Owner: Team B) are the real capabilities
 * that would ever produce a genuine HEALTHY/DEGRADED/FAILED reading —
 * neither is built, and `contracts/` has zero health content either
 * way. Same "only model what's real, not the computed reading nobody
 * has built yet" discipline `connectors.ts`'s own doc comment already
 * establishes for its own 4-value Connector State enum.
 *
 * `status` is a single-value union today (`"unknown"`) rather than a
 * boolean or omitted field — deliberately typed so a future story that
 * wires up the real E10-S04/E12-S005 checks can widen it to add
 * `"healthy" | "degraded" | "failed"` without a breaking shape change.
 * `getSystemHealth()` returns a fixed, hardcoded list — no write path,
 * since there is no legitimate way for this story to ever produce a
 * real health reading itself.
 */
export type SubsystemHealthStatus = "unknown";

export interface SubsystemHealth {
  id: string;
  name: string;
  status: SubsystemHealthStatus;
}

export async function getSystemHealth(): Promise<Result<SubsystemHealth[], ApiError>> {
  return {
    ok: true,
    value: [
      { id: "connectors", name: "連接器", status: "unknown" },
      { id: "models", name: "模型服務", status: "unknown" },
    ],
  };
}
