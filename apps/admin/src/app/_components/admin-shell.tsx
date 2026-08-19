import type { ReactNode } from "react";
import AdminSidebar from "./admin-sidebar";
import AdminHeader from "./admin-header";

/**
 * ux/admin-ui-overhaul: the sidebar/header/main frame around every admin
 * page — the apps/admin counterpart of apps/web's AppShell (E01-S005 +
 * ux/enterprise-polish). Fixed-viewport flex frame; .app-main is the
 * single scroll container so the sidebar scrolls independently.
 *
 * Pure chrome — carries no authorization. Route gating remains
 * AdminRouteGuard's job (E11-S023, structural, deliberately unwired
 * until a real session source exists).
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <AdminSidebar />
      <div className="app-content">
        <AdminHeader />
        <div className="app-main">{children}</div>
      </div>
    </div>
  );
}
