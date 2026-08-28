"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getUsageMetrics, type UsageMetrics } from "@/lib/usage-metrics";

const logger = createLogger("admin:usage-dashboard");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "loaded"; metrics: UsageMetrics };

/** Today's UTC calendar day, `YYYY-MM-DD` — matches the contract's own `date` semantics (E13-S019 EVIDENCE), not the browser's local timezone. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * E11-S021 "Usage dashboard" / E13-S012 "DAU/questions dashboard" /
 * E13-S021 "接真實 API" — adds a date picker (default: today UTC), a
 * `"forbidden"` state distinct from a generic error (AC2), and removes
 * the "尚未建置..." disclaimer now that the numbers are real.
 */
export default function UsageDashboard() {
  const [date, setDate] = useState(() => todayUtc());
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading usage metrics", { correlationId, date });

    setState({ status: "loading" });
    getUsageMetrics(date).then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load usage metrics", { correlationId, date, code: result.error.code });
        setState(result.error.code === "PERMISSION_DENIED" ? { status: "forbidden" } : { status: "error" });
        return;
      }

      logger.info("usage metrics loaded", { correlationId, date });
      setState({ status: "loaded", metrics: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <label htmlFor="usage-date">查詢日期（UTC）</label>
        <br />
        <input id="usage-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </p>

      {state.status === "loading" && <LoadingIndicator />}
      {state.status === "error" && <ErrorMessage message="無法載入使用量數據。" />}
      {state.status === "forbidden" && <ErrorMessage message="您沒有權限查看使用量數據。" />}

      {state.status === "loaded" && (
        <div className="stat-grid">
          <div className="stat-card">
            <strong>每日活躍使用者（DAU）</strong>
            <p>{state.metrics.dailyActiveUsers}</p>
          </div>
          <div className="stat-card">
            <strong>今日提問數</strong>
            <p>{state.metrics.questionsAsked}</p>
          </div>
        </div>
      )}
    </div>
  );
}
