"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getLatencyMetrics, type LatencyMetrics } from "@/lib/latency-metrics";

const logger = createLogger("admin:latency-dashboard");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; metrics: LatencyMetrics };

/**
 * E13-S013 "Latency dashboard" — same loading/error/loaded shape
 * usage-dashboard.tsx (E11-S021) already establishes. No empty state —
 * the metrics object always has a value (null today, see
 * latency-metrics.ts's own doc comment), same single-object reasoning
 * SystemSettingsPanel (E11-S020) and UsageDashboard already use.
 * `averageLatencyMs === null` renders "尚無資料" rather than a number —
 * distinct from a real "0ms" measurement, which this page would show as
 * "0" the same way UsageDashboard shows a real zero count.
 */
export default function LatencyDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading latency metrics", { correlationId });

    getLatencyMetrics().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load latency metrics", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("latency metrics loaded", { correlationId });
      setState({ status: "loaded", metrics: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入延遲數據。" />;
  }

  return (
    <div>
      <div>
        <strong>平均回應延遲</strong>
        <p>{state.metrics.averageLatencyMs === null ? "尚無資料" : `${state.metrics.averageLatencyMs}ms`}</p>
      </div>
      <p>尚未建置跨應用資料管道，無法顯示真實延遲數據。</p>
    </div>
  );
}
