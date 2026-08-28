"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { authClient } from "@/lib/auth";
import { useCurrentUser } from "@/lib/session-context";

const logger = createLogger("admin:header");

/**
 * ux/admin-ui-overhaul: slim header bar — the apps/web Header (E01-S005)
 * counterpart. Brand carries an explicit Admin badge so the console is
 * visually distinct from the end-user app at a glance (user-directed).
 *
 * E11-S026: a real session now exists (this header only ever renders
 * inside SessionGate — see (app)/layout.tsx), so the previously-empty
 * actions area gets a real logout button, mirroring apps/web's own
 * UserMenu's `handleLogout` (E01-S005) minus the dropdown/profile-link
 * chrome this app has no equivalent page for.
 */
export default function AdminHeader() {
  const user = useCurrentUser();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    const correlationId = crypto.randomUUID();
    setLoggingOut(true);
    logger.info("logout attempt", { correlationId, userId: user.userId });

    await authClient.logout();

    logger.info("logout succeeded", { correlationId, userId: user.userId });
    // Full navigation to a different route group unmounts SessionGate, so
    // a future visit to a protected route re-checks from scratch instead
    // of trusting stale "authenticated" state.
    router.replace("/login");
  }

  return (
    <header className="app-header">
      <span className="app-header-brand">
        <span>AI KM</span>
        <span className="admin-badge">Admin</span>
      </span>
      <span className="app-header-note">企業知識管理平台 — 後台管理</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
        <span>{user.userId}</span>
        <button type="button" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? "登出中…" : "登出"}
        </button>
      </span>
    </header>
  );
}
