"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createLogger } from "@ai-km/logger";
import { Icon } from "@ai-km/ui";
import { authClient } from "@/lib/auth";
import { useCurrentUser } from "@/lib/session-context";

const logger = createLogger("web:user-menu");

/**
 * E01-S005: user-menu trigger + logout. No dedicated "logout" story
 * exists in this epic — it belongs here, on the user-menu that owns
 * presenting/acting on the current user's identity. E01-S010 adds the
 * link to the Profile view for the same reason.
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
    <div className="m3-menu-anchor">
      <button
        type="button"
        className="m3-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon name="account_circle" />
        {user.userId}
      </button>
      {open && (
        <div role="menu" className="m3-menu">
          <Link href="/profile" role="menuitem" className="m3-menu-item">
            <Icon name="person" />
            個人資料
          </Link>
          <button type="button" role="menuitem" className="m3-menu-item" onClick={handleLogout} disabled={loggingOut}>
            <Icon name="logout" />
            {loggingOut ? "登出中…" : "登出"}
          </button>
        </div>
      )}
    </div>
  );
}
