"use client";

import { useId, useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { setConversationModel } from "@/lib/conversations";
import { AI_MODELS, type AiModel } from "@/lib/ai-models";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:model-selector");

/**
 * E03-S005: single-select AI model for a conversation. Rendered only
 * while the conversation's current mode is "advanced" — see
 * conversation-detail.tsx, which lifts the live mode out of ModeSwitch
 * via onModeChange specifically to gate this — per SOURCE_BASELINE.md's
 * E03 outline ("E03-S05 Model Selector / Advanced mode。"), unlike the
 * Knowledge Selector (S03/S04), which is available in both modes.
 *
 * Single-select stays a `<select>` (not a checkbox group like S04's
 * knowledge scopes) — a conversation always uses exactly one model to
 * generate a response, there's no "multi-model" story in the epic the
 * way Knowledge Selector had a single→multi upgrade path.
 *
 * Non-optimistic, same reasoning as the other two selectors.
 */
export function ModelSelector({
  conversationId,
  initialModel,
}: {
  conversationId: string;
  initialModel: AiModel;
}) {
  const selectId = useId();
  const [model, setModel] = useState<AiModel>(initialModel);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleChange(nextModel: AiModel) {
    if (nextModel === model || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("switching model", { correlationId, conversationId, from: model, to: nextModel });
    trackEvent("conversation_model_switch_attempt", { correlationId, properties: { from: model, to: nextModel } });

    const result = await setConversationModel(conversationId, nextModel);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to switch model", { correlationId, code: result.error.code });
      trackEvent("conversation_model_switch_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("model switched", { correlationId, model: result.value.model });
    trackEvent("conversation_model_switch_success", { correlationId, properties: { model: result.value.model } });
    setModel(result.value.model);
  }

  return (
    <div>
      <label htmlFor={selectId}>AI 模型</label>
      <br />
      <select
        id={selectId}
        value={model}
        disabled={pending}
        onChange={(event) => handleChange(event.target.value as AiModel)}
      >
        {AI_MODELS.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          切換中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="切換模型失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
