import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "AI KM",
  description: "Enterprise AI Knowledge Management & Work Assistant Platform",
};

/**
 * Application bootstrap root (E01-S001). Route skeleton splits below this
 * into a (public) zone (login) and an (app) zone (authenticated shell) —
 * see apps/web/src/app/(public) and apps/web/src/app/(app).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
