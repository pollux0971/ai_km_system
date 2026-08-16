import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AI KM Admin",
  description: "AI KM Admin Console",
};

/**
 * Application bootstrap root (E11-S001) — mirrors apps/web's own root
 * layout (E01-S001) for this second, separately-deployed app. Session/
 * route-level authorization is a later story's concern (E11-S023 "admin
 * route authorization", the direct counterpart of apps/web's own
 * RoleGuard from E01-S017); this root stays a bare passthrough, same as
 * apps/web's own bootstrap did before its own later stories layered
 * session gating and chrome on top.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
