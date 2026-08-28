import type { ReactNode } from "react";
import SessionGate from "./session-gate";
import AdminShell from "./_components/admin-shell";
import { AdminRouteGuardWrapper } from "./_components/admin-route-guard-wrapper";

/**
 * E11-S026: the authenticated-zone layout — mirrors
 * apps/web/src/app/(app)/layout.tsx's own SessionGate -> Shell -> Guard
 * composition. `AdminShell` is built here (a Server Component) and
 * passed into `SessionGate` as `children`, so it only ever mounts once a
 * session is confirmed — `AdminHeader`'s logout button relies on that
 * (via `useCurrentUser()`). `AdminRouteGuardWrapper` sits around only the
 * page content, not the chrome, so a denied route still shows the
 * sidebar/header to navigate elsewhere (same reasoning as apps/web's
 * RoleGuard placement).
 */
export default function AdminAppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AdminShell>
        <AdminRouteGuardWrapper>{children}</AdminRouteGuardWrapper>
      </AdminShell>
    </SessionGate>
  );
}
