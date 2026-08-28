"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getSystemHealth, type SubsystemHealth } from "@/lib/system-health";

const logger = createLogger("admin:system-health-dashboard");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; subsystems: SubsystemHealth[] };

const STATUS_LABEL: Record<SubsystemHealth["status"], string> = {
  unknown: "狀態未知",
};

/**
 * E11-S022 "System health dashboard" — same loading/error/loaded shape
 * every other admin page already establishes. No empty state — the
 * monitored subsystem list is a fixed, real list (see system-health.ts's
 * own doc comment), not something that can genuinely be empty.
 */
export default function SystemHealthDashboard() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading system health", { correlationId });

    getSystemHealth().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load system health", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("system health loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", subsystems: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入系統健康狀態。" />;
  }

  return (
    <div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {state.subsystems.map((subsystem) => (
          <li key={subsystem.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <p>
              <strong>{subsystem.name}</strong>
            </p>
            <p>{STATUS_LABEL[subsystem.status]}</p>
          </li>
        ))}
      </ul>
      <p>尚未建置真正的健康檢查機制，以上狀態皆為「未知」，不代表系統異常。</p>
    </div>
  );
}
