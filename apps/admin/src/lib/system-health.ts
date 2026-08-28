import { toResult } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { apiClient } from "./api";

/**
 * E11-S022 "System health dashboard" / E13-S021 "接真實 API".
 *
 * This is a STRUCTURAL rewrite, not just a data-source swap: the old stub
 * modeled 2 subsystems it could name without a real check
 * (`connectors`/`models`, Chinese display names, single `"unknown"`
 * status). The frozen contract (`contracts/openapi/analytics.yaml`
 * `SystemHealth`, E13-S018/E04-S047) names 4 different subsystems
 * (`api`/`database`/`migrations`/`asr`) with a real 4-value status enum —
 * these are not the same 2 concepts renamed, they are what
 * `apps/api/src/health/checks.ts` (E04-S047) actually measures. Chinese
 * display labels for the 4 real names live in `system-health-dashboard.tsx`
 * (a presentation concern), not here.
 */
export type SubsystemHealthStatus = "ok" | "degraded" | "down" | "unknown";
export type SubsystemName = "api" | "database" | "migrations" | "asr";

export interface SubsystemHealth {
  name: SubsystemName;
  status: SubsystemHealthStatus;
  detail?: string;
}

export interface SystemHealth {
  checkedAt: string;
  subsystems: SubsystemHealth[];
}

export async function getSystemHealth(): Promise<Result<SystemHealth, ApiError>> {
  return toResult(apiClient.analytics.GET("/admin/health", {}));
}
