"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import { listModels, type ModelOption } from "@/lib/models";
import ModelStatusToggle from "./model-status-toggle";

const logger = createLogger("admin:model-list");

type State = { status: "loading" } | { status: "error" } | { status: "loaded"; models: ModelOption[] };

const STATUS_LABEL: Record<ModelOption["status"], string> = {
  enabled: "啟用中",
  disabled: "已停用",
};

/**
 * E11-S013 "Model admin" — same loading/error/empty/loaded shape and
 * "pull fetch out of the mount effect so ModelStatusToggle's onToggled
 * can re-trigger it" pattern UserList (E11-S002/S005) already
 * establishes.
 */
export default function ModelList() {
  const [state, setState] = useState<State>({ status: "loading" });

  const fetchModels = useCallback((cancelledRef?: { current: boolean }) => {
    const correlationId = crypto.randomUUID();
    logger.info("loading model list", { correlationId });

    listModels().then((result) => {
      if (cancelledRef?.current) return;

      if (!result.ok) {
        logger.error("failed to load model list", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      logger.info("model list loaded", { correlationId, count: result.value.length });
      setState({ status: "loaded", models: result.value });
    });
  }, []);

  useEffect(() => {
    const cancelledRef = { current: false };
    fetchModels(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchModels]);

  if (state.status === "loading") {
    return <LoadingIndicator />;
  }

  if (state.status === "error") {
    return <ErrorMessage message="無法載入模型清單。" />;
  }

  if (state.models.length === 0) {
    return <EmptyState message="尚無模型。" />;
  }

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {state.models.map((model) => (
        <li key={model.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <p>
            <strong>{model.label}</strong>
          </p>
          <p>{STATUS_LABEL[model.status]}</p>
          <p>
            <ModelStatusToggle modelId={model.id} status={model.status} onToggled={() => fetchModels()} />
          </p>
        </li>
      ))}
    </ul>
  );
}
