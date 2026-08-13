"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { setConversationMode, type ConversationMode } from "@/lib/conversations";
import { trackEvent } from "@/lib/telemetry";

const logger = createLogger("web:mode-switch");

const MODE_LABELS: Record<ConversationMode, string> = {
  normal: "一般模式",
  advanced: "進階模式",
};

const MODE_OPTIONS: ConversationMode[] = ["normal", "advanced"];

/**
 * E03-S002: toggles a conversation between Normal and Advanced mode.
 * Per SOURCE_BASELINE.md's E03 outline, E03-S05's Model Selector is
 * Advanced-mode-only — conversation-detail.tsx passes onModeChange
 * (added by S005) to know the live mode without lifting all of this
 * component's state, so it can conditionally render ModelSelector.
 *
 * Deliberately not optimistic: the mock resolves near-instantly (no
 * real network latency to hide), so `mode` only updates on confirmed
 * success — simpler than optimistic-update-plus-rollback while still
 * fully correct, and there's nothing to roll back since the displayed
 * mode never changes ahead of confirmation.
 */
export function ModeSwitch({
  conversationId,
  initialMode,
  onModeChange,
}: {
  conversationId: string;
  initialMode: ConversationMode;
  onModeChange?: (mode: ConversationMode) => void;
}) {
  const [mode, setMode] = useState<ConversationMode>(initialMode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleSwitch(nextMode: ConversationMode) {
    if (nextMode === mode || pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("switching conversation mode", { correlationId, conversationId, from: mode, to: nextMode });
    trackEvent("conversation_mode_switch_attempt", { correlationId, properties: { from: mode, to: nextMode } });

    const result = await setConversationMode(conversationId, nextMode);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to switch conversation mode", { correlationId, code: result.error.code });
      trackEvent("conversation_mode_switch_failure", { correlationId, properties: { code: result.error.code } });
      setError(true);
      return;
    }

    logger.info("conversation mode switched", { correlationId, mode: result.value.mode });
    trackEvent("conversation_mode_switch_success", { correlationId, properties: { mode: result.value.mode } });
    setMode(result.value.mode);
    onModeChange?.(result.value.mode);
  }

  return (
    <div>
      <div role="group" aria-label="對話模式">
        {MODE_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            disabled={pending}
            onClick={() => handleSwitch(option)}
          >
            {MODE_LABELS[option]}
          </button>
        ))}
      </div>
      {pending && (
        <p role="status" style={{ marginTop: 8 }}>
          切換中…
        </p>
      )}
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message="切換模式失敗，請稍後再試。" />
        </div>
      )}
    </div>
  );
}
