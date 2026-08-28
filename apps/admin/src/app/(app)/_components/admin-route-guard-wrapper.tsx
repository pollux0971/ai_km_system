"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@ai-km/permissions";
import { useCurrentUser } from "@/lib/session-context";
import { AdminRouteGuard } from "./admin-route-guard";

/**
 * E11-S026: wires the real session/pathname into E11-S023's already-tested
 * `AdminRouteGuard`, which deliberately takes `pathname`/`userRoles` as
 * explicit props rather than reading hooks itself (see its own doc
 * comment) — so its existing unit tests (frozen, per this story's
 * Development Boundaries) never needed to change. This is the thin
 * adapter layer that was missing; only this file is new, `AdminRouteGuard`
 * itself is untouched.
 *
 * Only ever rendered inside SessionGate (this file lives under (app)/),
 * so `useCurrentUser()` never actually throws here — `userRoles` is
 * always a real array, never the `null` ("no session") case
 * `AdminRouteGuard` also handles; that branch is exercised by its own
 * existing unit tests directly, not reachable through this wrapper.
 */
export function AdminRouteGuardWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const user = useCurrentUser();
  // AuthSession.roles is `string[]` (services/identity stores JSON-encoded
  // roles, decoded generically — @ai-km/auth-client has no dependency on
  // @ai-km/permissions). The server is the sole source of truth for role
  // assignment (Security Boundary: "authorization result by deterministic
  // platform control"), so this cast reflects an existing trust boundary,
  // not a client-side invention of permissions.
  const userRoles = user.roles as Role[];

  return (
    <AdminRouteGuard pathname={pathname} userRoles={userRoles}>
      {children}
    </AdminRouteGuard>
  );
}
