"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackEvent } from "./telemetry";

/**
 * E01-S019: fires a "page_view" telemetry event whenever the route
 * changes. Call once near the top of each zone's client entry point
 * (see (app)/session-gate.tsx and (public)/login/login-form.tsx) — that
 * covers every current and future page in the zone with no per-page
 * wiring, the same "wire once at the entry point" pattern E01-S017's
 * RoleGuard already established for this app.
 */
export function usePageViewTelemetry(): void {
  const pathname = usePathname();

  useEffect(() => {
    trackEvent("page_view", { properties: { pathname } });
  }, [pathname]);
}
