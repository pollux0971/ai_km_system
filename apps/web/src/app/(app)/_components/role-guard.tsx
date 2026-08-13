"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ErrorMessage } from "@ai-km/ui";
import { useCurrentUser } from "@/lib/session-context";
import { rolesRequiredFor } from "@/lib/nav-items";

/**
 * E01-S017 route-level 403 guard. Wired once around every page in
 * apps/web/src/app/(app)/layout.tsx, so future routes (E05/E07/E09's
 * /knowledge, /maintenance, /erp) are protected the moment they exist,
 * with no extra work from their own stories.
 *
 * Client-side UX guard only — per the Frontend/UX Boundary ("UI
 * permission hiding 只屬 UX,不可作為 security control"), this is not the
 * authorization boundary; that's E02's job once it exists. This component
 * only ever runs inside SessionGate, so it only ever sees an authenticated
 * user — the 401 case is already handled upstream (session-gate.tsx).
 */
export function RoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const requiredRoles = rolesRequiredFor(pathname);

  const allowed =
    requiredRoles === undefined || requiredRoles === "all" || requiredRoles.some((role) => user.roles.includes(role));

  if (!allowed) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorMessage code="FORBIDDEN" />
      </div>
    );
  }

  return <>{children}</>;
}
