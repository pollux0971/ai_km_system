import type { ReactNode } from "react";
import "./globals.css";
import AdminShell from "./_components/admin-shell";

export const metadata = {
  title: "AI KM Admin",
  description: "AI KM Admin Console",
};

/**
 * Application bootstrap root (E11-S001) — mirrors apps/web's own root
 * layout (E01-S001) for this second, separately-deployed app. Session/
 * route-level authorization remains a later concern (E11-S023 "admin
 * route authorization" built the structural guard; it stays unwired
 * until a real session source exists — see AdminRouteGuard's own doc
 * comment).
 *
 * ux/admin-ui-overhaul: pages now render inside AdminShell (sidebar +
 * header chrome), the same layered-on-later chrome apps/web's own (app)
 * layout added in E01-S005. The shell is pure chrome and carries no
 * authorization.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
