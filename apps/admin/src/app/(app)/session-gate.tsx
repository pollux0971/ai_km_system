"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createLogger } from "@ai-km/logger";
import { ErrorMessage, LoadingIndicator } from "@ai-km/ui";
import type { AuthSession } from "@ai-km/auth-client";
import { authClient } from "@/lib/auth";
import { CurrentUserProvider } from "@/lib/session-context";

const logger = createLogger("admin:session-gate");

type GateState =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "error" }
  | { status: "authenticated"; session: AuthSession };

/**
 * E11-S026 session bootstrap (mirrors apps/web/src/app/(app)/session-gate.tsx
 * from E01-S004): the (app) shell's authentication gate. Loads the current
 * session once on mount; renders children only once a session is
 * confirmed. No session -> redirect to /login with this path as
 * returnUrl. Session-check failure is a distinct state from "no
 * session" — it must not be silently treated as logged-out (UX AC:
 * loading/redirecting/error/permission-denied must be distinct states).
 */
export default function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<GateState>({ status: "loading" });

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

  return <CurrentUserProvider value={state.session}>{children}</CurrentUserProvider>;
}
