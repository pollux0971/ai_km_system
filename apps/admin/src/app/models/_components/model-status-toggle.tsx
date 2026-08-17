"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { disableModel, enableModel, type ModelOption } from "@/lib/models";

const logger = createLogger("admin:model-status-toggle");

/**
 * E11-S013 "Model admin" — same shape UserStatusToggle (E11-S005)
 * already establishes: button label directly names the next action,
 * no confirmation step (same "low-risk, reversible operation" reasoning
 * — an admin who toggles the wrong model can just toggle it back),
 * non-optimistic. `onToggled` tells the parent list to refetch, same
 * "the parent re-fetches, the child doesn't keep its own state" shape.
 */
export default function ModelStatusToggle({
  modelId,
  status,
  onToggled,
}: {
  modelId: ModelOption["id"];
  status: ModelOption["status"];
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info(status === "enabled" ? "disabling model" : "enabling model", { correlationId, modelId });

    const result = status === "enabled" ? await disableModel(modelId) : await enableModel(modelId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle model status", { correlationId, modelId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("model status toggled", { correlationId, modelId, status: result.value.status });
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
