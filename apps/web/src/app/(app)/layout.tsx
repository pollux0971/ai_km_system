import type { ReactNode } from "react";
import SessionGate from "./session-gate";
import AppShell from "./_components/app-shell";
import { RoleGuard } from "./_components/role-guard";

/**
 * Authenticated-zone layout. Route skeleton established by E01-S001;
 * session/current-user gating wired up by E01-S004 (SessionGate);
 * sidebar/header/main/user-menu chrome wired up by E01-S005 (AppShell);
 * per-route 403 guard wired up by E01-S017 (RoleGuard). AppShell is built
 * here (a Server Component) and passed into SessionGate as `children`, so
 * it only ever mounts once a session is confirmed — useCurrentUser()
 * inside AppShell's UserMenu (and inside RoleGuard) relies on that.
 * RoleGuard sits around only the page content, not the chrome, so a
 * denied page still shows the sidebar/header to navigate elsewhere.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>
        <RoleGuard>{children}</RoleGuard>
      </AppShell>
    </SessionGate>
  );
}
