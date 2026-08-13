import type { ReactNode } from "react";

/**
 * Authenticated-zone layout established by E01-S001 as the attachment
 * point for later stories: session/current-user gating (E01-S004) and
 * sidebar/header/main chrome (E01-S005). Intentionally a passthrough
 * until those stories land — this story only owns the route skeleton.
 */
export default function AppShellLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
