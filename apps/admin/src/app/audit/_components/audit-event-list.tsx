"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listAuditEvents, type AuditEvent } from "@/lib/audit";

const logger = createLogger("admin:audit-event-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; events: AuditEvent[] };

/**
 * E11-S015 "Audit viewer" — same loading/error/empty/loaded shape
 * RoleList (E11-S006) already establishes for a read-only list page.
 * Unlike every other admin list, `empty` is the real, always-true
 * production state today (see audit.ts's own doc comment for why) —
 * not just a defensively-tested edge case.
 */
export default function AuditEventList() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();
    logger.info("loading audit event list", { correlationId });

    listAuditEvents().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("failed to load audit event list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("audit event list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", events: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入稽核紀錄。" />;
  }

  if (state.events.length === 0) {
    return <EmptyState message="尚無稽核紀錄。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.events.map((event) => (
        <li key={event.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <p>
            <strong>{event.actor}</strong>
          </p>
          <p>{event.action}</p>
          <p>{event.target}</p>
          <p>
            <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("zh-TW")}</time>
          </p>
        </li>
      ))}
    </ul>
  );
}
