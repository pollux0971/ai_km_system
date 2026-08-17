"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { disableConnector, enableConnector, type Connector } from "@/lib/connectors";

const logger = createLogger("admin:connector-status-toggle");

/**
 * E11-S014 "Connector admin" — same shape ModelStatusToggle (E11-S013)
 * already establishes: button label directly names the next action, no
 * confirmation step, non-optimistic. `onToggled` tells the parent list
 * to refetch.
 */
export default function ConnectorStatusToggle({
  connectorId,
  status,
  onToggled,
}: {
  connectorId: Connector["id"];
  status: Connector["status"];
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info(status === "enabled" ? "disabling connector" : "enabling connector", { correlationId, connectorId });

    const result = status === "enabled" ? await disableConnector(connectorId) : await enableConnector(connectorId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle connector status", { correlationId, connectorId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("connector status toggled", { correlationId, connectorId, status: result.value.status });
    onToggled();
  }

  return (
    <>
      <button type="button" onClick={handleToggle} disabled={pending}>
        {status === "enabled" ? "停用" : "啟用"}
      </button>
      {error && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={status === "enabled" ? "停用失敗，請稍後再試。" : "啟用失敗，請稍後再試。"} />
        </span>
      )}
    </>
  );
}
