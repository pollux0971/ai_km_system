"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getLatencyMetrics, type LatencyMetrics } from "@/lib/latency-metrics";

const logger = createLogger("admin:latency-dashboard");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "loaded"; metrics: LatencyMetrics };

/**
 * E13-S013 "Latency dashboard" / E13-S021 "接真實 API" — adds `sampleCount`
 * display (the contract's own required field) and a `"forbidden"` state
 * distinct from a generic error (AC2); removes the "尚未建置..."
 * disclaimer now that the numbers are real. `averageLatencyMs === null`
 * still renders "尚無資料" rather than a number — unchanged reasoning,
 * now genuinely reachable (zero real samples) rather than the only
 * possible outcome.
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
        setState(result.error.code === "PERMISSION_DENIED" ? { status: "forbidden" } : { status: "error" });
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

  if (state.status === "forbidden") {
    return <ErrorMessage message="您沒有權限查看延遲數據。" />;
  }

  return (
    <div className="stat-grid">
      <div className="stat-card">
        <strong>平均回應延遲</strong>
        <p>{state.metrics.averageLatencyMs === null ? "尚無資料" : `${state.metrics.averageLatencyMs}ms`}</p>
      </div>
      <div className="stat-card">
        <strong>樣本數</strong>
        <p>{state.metrics.sampleCount}</p>
      </div>
    </div>
  );
}
