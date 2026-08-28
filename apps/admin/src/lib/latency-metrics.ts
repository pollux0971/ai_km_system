import { toResult } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { apiClient } from "./api";

/**
 * E13-S013 "Latency dashboard" / E13-S021 "接真實 API". `sampleCount` is a
 * new field (the contract's own `LatencyMetrics.sampleCount`, required) —
 * an admin reading `averageLatencyMs: null` now also sees *why* (0 samples)
 * rather than just an absence. `days` mirrors the contract's own optional
 * trailing-window parameter; omitted here, the server applies its own
 * default (E13-S019 EVIDENCE: 7).
 */
export interface LatencyMetrics {
  averageLatencyMs: number | null;
  sampleCount: number;
}

export async function getLatencyMetrics(days?: number): Promise<Result<LatencyMetrics, ApiError>> {
  // Conditional spread, not `{ days }` — an explicit `undefined` value
  // still serializes onto the query string rather than being omitted
  // (`listFeedback`'s own doc comment, `apps/admin/src/lib/feedback.ts`,
  // has the full explanation).
  return toResult(
    apiClient.analytics.GET("/admin/metrics/latency", {
      params: { query: { ...(days !== undefined ? { days } : {}) } },
    }),
  );
}
