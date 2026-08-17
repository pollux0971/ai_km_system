import type { ReactNode } from "react";
import { ErrorMessage } from "@ai-km/ui";
import type { Role } from "@ai-km/permissions";
import { rolesRequiredForAdminRoute } from "@/lib/admin-route-access";

/**
 * E11-S023 "admin route authorization". Structural counterpart to
 * `apps/web`'s own `RoleGuard` (E01-S017, approved) — but deliberately
 * NOT wired into `layout.tsx` yet, and deliberately takes `userRoles`
 * as an explicit prop rather than reading a session context the way
 * `RoleGuard` reads `useCurrentUser()`.
 *
 * Why: apps/admin has no login page, no session bootstrap, and no
 * admin-privileged account anywhere — `@ai-km/auth-client`'s own mock
 * (E01-S002) only seeds 3 non-admin accounts (general_user/
 * maintenance_engineer/sales_purchasing), and the real identity/RBAC
 * backend is `E02` (Team B, not built). Wiring a hard gate into the
 * real layout today would require inventing a login flow — and doing
 * so would break every one of the 22 already-approved admin E2E specs
 * (S002 through S022), each written as direct, unauthenticated
 * navigation, each its own already-approved story's own frozen test
 * content. That's disproportionate cross-story scope for a single
 * thin-slice story, and inventing a fake "everyone is already logged
 * in as super_administrator" default would be exactly the kind of
 * mock-pretending-production-is-done this story's own Scope/Out
 * explicitly forbids.
 *
 * So this story's own honest scope is the STRUCTURAL half only: the
 * route -> role mapping (`admin-route-access.ts`) and this guard's
 * allow/deny logic are both real and fully tested — ready to wire in
 * the moment a real session source exists — while the actual
 * connection to `layout.tsx` is explicitly deferred, not faked.
 *
 * `userRoles: null` means "no session" (the 401-equivalent case,
 * handled here rather than a separate SessionGate, since apps/admin
 * has no such component to split it out to) — kept as a DISTINCT
 * message from the 403 case (`Security AC` / this app's own UX AC:
 * loading/error/permission-denied must be distinct states, not folded
 * together). Unlike `RoleGuard`, an unclassified route (`undefined`
 * from `rolesRequiredForAdminRoute`) is treated as DENY, not open —
 * the opposite default from `RoleGuard`'s own "not in NAV_ITEMS = open
 * to any authenticated role, by design" choice. That default is safe
 * for apps/web's own low-sensitivity routes (e.g. /profile) but unsafe
 * here: this is the admin console itself, and Deny Wins means a newly
 * added, not-yet-classified admin route must fail closed, never
 * silently open to everyone.
 */
export function AdminRouteGuard({
  pathname,
  userRoles,
  children,
}: {
  pathname: string;
  userRoles: Role[] | null;
  children: ReactNode;
}) {
  if (userRoles === null) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorMessage code="UNAUTHORIZED" />
      </div>
    );
  }

  const requiredRoles = rolesRequiredForAdminRoute(pathname);
  const allowed = requiredRoles !== undefined && requiredRoles.some((role) => userRoles.includes(role));

  if (!allowed) {
    return (
      <div style={{ padding: 32 }}>
        <ErrorMessage code="FORBIDDEN" />
      </div>
    );
  }

  return <>{children}</>;
}
