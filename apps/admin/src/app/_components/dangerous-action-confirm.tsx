"use client";

import { useState } from "react";
import { ErrorMessage } from "@ai-km/ui";
import { createLogger } from "@ai-km/logger";
import type { ApiError, Result } from "@ai-km/types";

const logger = createLogger("admin:dangerous-action-confirm");

/**
 * E11-S024 "dangerous-action confirmation". A generic, reusable
 * two-step trigger->alertdialog primitive, closely mirroring the
 * pattern `apps/web` already established twice and independently
 * approved — `DeleteConversation` (E03-S025) and
 * `KnowledgeDocumentDeleteButton` (E05-S026): clicking the trigger
 * doesn't perform anything by itself, it reveals an explicit
 * `role="alertdialog"` confirm/cancel step whose accessible name
 * includes the target's own identity (`dialogLabel`), not just the
 * visible message text — the exact gap an earlier version of
 * `KnowledgeDocumentDeleteButton` had before its own independent
 * review caught it (see that component's own doc comment).
 *
 * Deliberately NOT wired to any existing admin action today. The only
 * candidates on record are `ModelStatusToggle`'s "啟用雲端模型"
 * (E11-S013) and `ConnectorStatusToggle`'s "啟用連接器" (E11-S014) —
 * both stories explicitly considered and declined adding a confirmation
 * step, because enabling either is still a purely local mock action
 * with zero real-world effect (no real Model Gateway/Connector
 * integration exists yet), and both left an honest note that THIS
 * story would supply the mechanism once one of them actually needs it.
 * Retrofitting a confirmation step onto an action their own owning
 * stories already decided doesn't need one yet would second-guess
 * their own already-approved reasoning, not honor it. No delete
 * capability exists anywhere in `apps/admin` either — every list-page
 * story built so far (Department/Group/Prompt/User/...) is list+create
 * only, by its own story's explicit scope. So this story's own honest
 * scope is the same structural-only shape `AdminRouteGuard` (E11-S023)
 * already established: the reusable capability exists, is fully
 * tested, and is ready to be dropped onto a genuinely dangerous action
 * — whichever future story first adds one (a real delete, or Model/
 * Connector toggles once they gain real effect) — without needing to
 * reinvent this pattern from scratch.
 *
 * No audit-event emission lives inside this component — `audit.ts`'s
 * own doc comment (E11-S015) already establishes there is no
 * legitimate write path until a real E14 (Team B) audit append API
 * exists; once one does, the CALLER's own `onConfirm` is exactly where
 * that audit event would be emitted, not this generic primitive.
 *
 * `isConfirming` resets to `false` on a successful confirm (unlike the
 * two `apps/web` precedents, which rely on their own caller removing
 * the whole component from a list instead) — a deliberate, self-
 * contained default so this reusable primitive behaves safely even
 * for a future caller that does NOT remove its own host element after
 * success.
 */
export function DangerousActionConfirm({
  triggerLabel,
  dialogLabel,
  message,
  confirmLabel,
  cancelLabel = "取消",
  errorMessage,
  onConfirm,
  onConfirmed,
}: {
  triggerLabel: string;
  dialogLabel: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  errorMessage: string;
  onConfirm: () => Promise<Result<unknown, ApiError>>;
  onConfirmed: () => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  function startConfirming() {
    setError(false);
    setIsConfirming(true);
  }

  function cancelConfirming() {
    setIsConfirming(false);
    setError(false);
  }

  async function handleConfirm() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info("dangerous action confirmed, executing", { correlationId, dialogLabel });

    const result = await onConfirm();
    setPending(false);

    if (!result.ok) {
      logger.error("dangerous action failed", { correlationId, dialogLabel, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("dangerous action succeeded", { correlationId, dialogLabel });
    setIsConfirming(false);
    onConfirmed();
  }

  if (!isConfirming) {
    return (
      <button type="button" onClick={startConfirming}>
        {triggerLabel}
      </button>
    );
  }

  return (
    <div role="alertdialog" aria-label={dialogLabel}>
      <p>{message}</p>
      <button type="button" onClick={handleConfirm} disabled={pending}>
        {confirmLabel}
      </button>
      <button type="button" onClick={cancelConfirming} disabled={pending}>
        {cancelLabel}
      </button>
      {error && (
        <div style={{ marginTop: 8 }}>
          <ErrorMessage message={errorMessage} />
        </div>
      )}
    </div>
  );
}
