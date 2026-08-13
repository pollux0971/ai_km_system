import type { ReactNode } from "react";
import SessionGate from "./session-gate";

/**
 * Authenticated-zone layout. Route skeleton established by E01-S001;
 * session/current-user gating wired up by E01-S004 (SessionGate).
 * Sidebar/header/main chrome (E01-S005) still lands inside SessionGate's
 * authenticated children, not here.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return <SessionGate>{children}</SessionGate>;
}
