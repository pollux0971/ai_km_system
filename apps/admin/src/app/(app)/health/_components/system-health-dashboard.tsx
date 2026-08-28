"use client";

import { useEffect, useState } from "react";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { getSystemHealth, type SubsystemHealth, type SubsystemName } from "@/lib/system-health";

const logger = createLogger("admin:system-health-dashboard");

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "forbidden" }
  | { status: "loaded"; checkedAt: string; subsystems: SubsystemHealth[] };

const SUBSYSTEM_LABEL: Record<SubsystemName, string> = {
  api: "API 服務",
  database: "資料庫",
  migrations: "資料庫遷移",
  asr: "語音辨識",
};

const STATUS_LABEL: Record<SubsystemHealth["status"], string> = {
  ok: "正常",
  degraded: "部分異常",
  down: "中斷",
  unknown: "狀態未知",
};

/**
 * E11-S022 "System health dashboard" / E13-S021 "接真實 API" — a
 * STRUCTURAL rewrite (see `system-health.ts`'s own doc comment for why),
 * not just a data-source swap: 4 real subsystems (`api`/`database`/
 * `migrations`/`asr`), a real 4-value status, and a `"forbidden"` state
 * (AC2). Removes the "尚未建置..." disclaimer now that the statuses are
 * real health-check results (E04-S047), not a hardcoded placeholder.
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
        setState(result.error.code === "PERMISSION_DENIED" ? { status: "forbidden" } : { status: "error" });
        return;
      }

      logger.info("system health loaded", { correlationId, count: result.value.subsystems.length });
      setState({ status: "loaded", checkedAt: result.value.checkedAt, subsystems: result.value.subsystems });
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

  if (state.status === "forbidden") {
    return <ErrorMessage message="您沒有權限查看系統健康狀態。" />;
  }

  return (
    <div>
      <p style={{ marginBottom: 16 }}>
        <time dateTime={state.checkedAt}>檢查時間:{new Date(state.checkedAt).toLocaleString("zh-TW")}</time>
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {state.subsystems.map((subsystem) => (
          <li key={subsystem.name} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <p>
              <strong>{SUBSYSTEM_LABEL[subsystem.name]}</strong>
            </p>
            <p>{STATUS_LABEL[subsystem.status]}</p>
            {subsystem.detail && <p>{subsystem.detail}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
