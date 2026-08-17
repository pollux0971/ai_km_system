"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listConnectors, type Connector } from "@/lib/connectors";
import ConnectorStatusToggle from "./connector-status-toggle";

const logger = createLogger("admin:connector-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; connectors: Connector[] };

const STATUS_LABEL: Record<Connector["status"], string> = {
  enabled: "啟用中",
  disabled: "已停用",
};

/**
 * E11-S014 "Connector admin" — same loading/error/empty/loaded shape
 * and refetch-on-toggle pattern ModelList (E11-S013) already
 * establishes.
 */
export default function ConnectorList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const fetchConnectors = useCallback((cancelledRef?: { current: boolean }) => {
    const correlationId = crypto.randomUUID();
    logger.info("loading connector list", { correlationId });

    listConnectors().then((result) => {
      if (cancelledRef?.current) return;

      if (!result.ok) {
        logger.error("failed to load connector list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("connector list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", connectors: result.value });
    });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchConnectors(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchConnectors]);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入連接器清單。" />;
  }

  if (state.connectors.length === 0) {
    return <EmptyState message="尚無連接器。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.connectors.map((connector) => (
        <li key={connector.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #e5e5e5" }}>
          <p>
            <strong>{connector.name}</strong>
          </p>
          <p>{STATUS_LABEL[connector.status]}</p>
          <p>
            <ConnectorStatusToggle connectorId={connector.id} status={connector.status} onToggled={() => fetchConnectors()} />
          </p>
        </li>
      ))}
    </ul>
  );
}
