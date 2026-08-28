import type { ReactNode } from "react";
import { headers } from "next/headers";
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
export default async function RootLayout({ children }: { children: ReactNode }) {
  // E01-S029: see apps/web/src/app/layout.tsx's doc comment — reading
  // headers() here is required for Next.js to apply the per-request CSP
  // nonce (middleware.ts) to its own inline RSC bootstrap script and to opt
  // this route tree out of static prerendering.
  await headers();
  return (
    <html lang="zh-Hant">
      <body>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
