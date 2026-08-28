import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";

export const metadata = {
  title: "AI KM Admin",
  description: "AI KM Admin Console",
};

/**
 * Application bootstrap root (E11-S001) — mirrors apps/web's own root
 * layout (E01-S001) for this second, separately-deployed app.
 *
 * E11-S026: route skeleton now splits below this into a (public) zone
 * (login — no shell, no session check) and an (app) zone (session gate
 * + AdminRouteGuard + AdminShell chrome) — see
 * apps/admin/src/app/(public) and apps/admin/src/app/(app). This root
 * layout stays deliberately minimal (same as apps/web's own root
 * layout.tsx) so neither zone inherits chrome or auth logic it
 * shouldn't.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  // E01-S029: see apps/web/src/app/layout.tsx's doc comment — reading
  // headers() here is required for Next.js to apply the per-request CSP
  // nonce (middleware.ts) to its own inline RSC bootstrap script and to opt
  // this route tree out of static prerendering.
  await headers();
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
