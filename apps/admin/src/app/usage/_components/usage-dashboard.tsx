"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getUsageMetrics, type UsageMetrics } from "@/lib/usage-metrics";

const logger = createLogger("admin:usage-dashboard");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; metrics: UsageMetrics };

/**
 * E11-S021 "Usage dashboard" — same loading/error/loaded shape every
 * other admin page already establishes. No empty state — the metrics
 * always have a value (zero today, see usage-metrics.ts's own doc
 * comment), same reasoning SystemSettingsPanel (E11-S020) already
 * establishes for a single-object, non-list page.
 */
export default function UsageDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading usage metrics", { correlationId });

    getUsageMetrics().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load usage metrics", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("usage metrics loaded", { correlationId });
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
    return <ErrorMessage message="無法載入使用量數據。" />;
  }

  return (
    <div>
      <div>
        <strong>每日活躍使用者（DAU）</strong>
        <p>{state.metrics.dailyActiveUsers}</p>
      </div>
      <div>
        <strong>今日提問數</strong>
        <p>{state.metrics.questionsAsked}</p>
      </div>
      <p>尚未建置使用量追蹤機制，以上數據皆為零。</p>
    </div>
  );
}
