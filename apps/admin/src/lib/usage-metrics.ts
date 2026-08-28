import { toResult } from "@ai-km/api-client";
import type { ApiError, Result } from "@ai-km/types";
import { apiClient } from "./api";

/**
 * E11-S021 "Usage dashboard" / E13-S012 "DAU/questions dashboard" / E13-S021
 * "接真實 API". `date` is now a required parameter (contract, `GET /admin/
 * metrics/usage`'s `date` query param) rather than an implicit "today" the
 * server picked — `usage-dashboard.tsx` supplies it (default: today's UTC
 * calendar day), matching the contract's own "UTC calendar day" semantics
 * rather than the caller's local timezone.
 */
export interface UsageMetrics {
  date: string;
  dailyActiveUsers: number;
  questionsAsked: number;
}

export async function getUsageMetrics(date: string): Promise<Result<UsageMetrics, ApiError>> {
  return toResult(apiClient.analytics.GET("/admin/metrics/usage", { params: { query: { date } } }));
}
