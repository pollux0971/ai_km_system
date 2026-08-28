"use client";

import { useState } from "react";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage } from "@ai-km/ui";
import { disableUser, enableUser, type AdminUser } from "@/lib/users";

const logger = createLogger("admin:user-status-toggle");

/**
 * E11-S005 "Disable/enable user". Closely mirrors
 * KnowledgeDocumentArchiveToggle (E05-S025) — button label directly
 * names the next action ("停用"/"啟用"), no confirmation step (same
 * "low-risk, reversible operations don't need a confirm dialog"
 * reasoning — an admin who disables the wrong account by mistake can
 * just enable it again), non-optimistic.
 *
 * Unlike KnowledgeDocumentArchiveToggle, this component's parent list
 * has no active/disabled view split (UserList has shown every status
 * together, mixed, since E11-S002) — the row this toggle lives in never
 * disappears after a toggle, it just needs its own displayed status to
 * refresh. `onToggled` is still the same "tell the parent to refetch"
 * callback shape; the parent's own re-render (with the fresh `status`
 * for this same user) is what flips this component's `status` prop and
 * therefore its label, not any local state kept here.
 *
 * No trackEvent — apps/admin has no telemetry lib the way apps/web does;
 * same already-approved S001-S004 precedent (logger + correlationId
 * alone satisfies the correlation-id/structured-telemetry AC here).
 */
export default function UserStatusToggle({
  userId,
  status,
  onToggled,
}: {
  userId: string;
  status: AdminUser["status"];
  onToggled: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function handleToggle() {
    if (pending) return;

    const correlationId = crypto.randomUUID();
    setPending(true);
    setError(false);
    logger.info(status === "active" ? "disabling user" : "enabling user", { correlationId, userId });

    const result = status === "active" ? await disableUser(userId) : await enableUser(userId);
    setPending(false);

    if (!result.ok) {
      logger.error("failed to toggle user status", { correlationId, userId, code: result.error.code });
      setError(true);
      return;
    }

    logger.info("user status toggled", { correlationId, userId, status: result.value.status });
    onToggled();
  }

  return (
    <>
      <button type="button" onClick={handleToggle} disabled={pending}>
        {status === "active" ? "停用" : "啟用"}
      </button>
      {error && (
        <span style={{ marginLeft: 8 }}>
          <ErrorMessage message={status === "active" ? "停用失敗，請稍後再試。" : "啟用失敗，請稍後再試。"} />
        </span>
      )}
    </>
  );
}
