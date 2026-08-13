import type { ReactNode } from "react";
import SessionGate from "./session-gate";
import AppShell from "./_components/app-shell";

/**
 * Authenticated-zone layout. Route skeleton established by E01-S001;
 * session/current-user gating wired up by E01-S004 (SessionGate);
 * sidebar/header/main/user-menu chrome wired up by E01-S005 (AppShell).
 * AppShell is built here (a Server Component) and passed into SessionGate
 * as `children`, so it only ever mounts once a session is confirmed —
 * useCurrentUser() inside AppShell's UserMenu relies on that.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <AppShell>{children}</AppShell>
    </SessionGate>
  );
}
