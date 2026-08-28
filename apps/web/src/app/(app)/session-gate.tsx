"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import type { AuthSession } from "@ai-km/auth-client";
import { authClient } from "@/lib/auth";
import { ConversationEventsProvider } from "@/lib/conversation-events-context";
import { CurrentUserProvider } from "@/lib/session-context";
import { usePageViewTelemetry } from "@/lib/use-page-view-telemetry";

const logger = createLogger("web:session-gate");

type GateState =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "error" }
  | { status: "authenticated"; session: AuthSession };

/**
 * E01-S004 session bootstrap: the (app) shell's authentication gate.
 * Loads the current session once on mount; renders children (with the
 * current user available via useCurrentUser) only once a session is
 * confirmed. No session -> redirect to /login with this path as
 * returnUrl (the other half of E01-S003's redirect, which only handled
 * returning FROM /login). Session-check failure is a distinct state
 * from "no session" — it must not be silently treated as logged-out
 * (AC4: dependency failure must be classifiable, never mislabeled).
 */
export default function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>({ status: "loading" });

  // E01-S019: wired here (not per-page) so every current and future page
  // under (app) gets page-view telemetry with no extra work — same
  // "wire once at the entry point" pattern as E01-S017's RoleGuard.
  usePageViewTelemetry();

  useEffect(() => {
    let cancelled = false;
    const correlationId = crypto.randomUUID();

    authClient.getSession().then((result) => {
      if (cancelled) return;

      if (!result.ok) {
        logger.error("session bootstrap failed", { correlationId, code: result.error.code });
        setState({ status: "error" });
        return;
      }

      if (!result.value) {
        logger.info("no active session, redirecting to login", { correlationId, pathname });
        setState({ status: "redirecting" });
        router.replace(`/login?returnUrl=${encodeURIComponent(pathname)}`);
        return;
      }

      logger.info("session bootstrap succeeded", { correlationId, userId: result.value.userId });
      setState({ status: "authenticated", session: result.value });
    });

    return () => {
      cancelled = true;
    };
  }, [router, pathname]);

  if (state.status === "loading" || state.status === "redirecting") {
    return (
      <div style={{ padding: 32 }}>
        <LoadingIndicator />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div style={{ padding: 32 }}>
        <ErrorMessage message="無法載入使用者資訊，請重新整理頁面。" />
      </div>
    );
  }

  return (
    <CurrentUserProvider value={state.session}>
      {/* E03-S039: one SSE connection per authenticated tab — mounted here
          (not per-consumer) so it survives client-side navigation and
          closes exactly once, on logout/unmount (AC1, Security AC). */}
      <ConversationEventsProvider>{children}</ConversationEventsProvider>
    </CurrentUserProvider>
  );
}
