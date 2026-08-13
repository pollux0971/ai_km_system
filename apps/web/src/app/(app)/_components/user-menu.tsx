"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { authClient } from "@/lib/auth";
import { useCurrentUser } from "@/lib/session-context";

const logger = createLogger("web:user-menu");

/**
 * E01-S005: user-menu trigger + logout. No dedicated "logout" story
 * exists in this epic — it belongs here, on the user-menu that owns
 * presenting/acting on the current user's identity.
 */
export default function UserMenu() {
  const user = useCurrentUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    const correlationId = crypto.randomUUID();
    setLoggingOut(true);
    logger.info("logout attempt", { correlationId, userId: user.userId });

    await authClient.logout();

    logger.info("logout succeeded", { correlationId, userId: user.userId });
    // Full navigation to a different route group unmounts SessionGate,
    // so a future visit to a protected route re-checks from scratch
    // instead of trusting stale "authenticated" state.
    router.replace("/login");
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu">
        {user.userId}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            border: "1px solid #e5e5e5",
            background: "#ffffff",
            padding: 4,
          }}
        >
          <button type="button" role="menuitem" onClick={handleLogout} disabled={loggingOut}>
            {loggingOut ? "登出中…" : "登出"}
          </button>
        </div>
      )}
    </div>
  );
}
