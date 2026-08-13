import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI KM",
  description: "Enterprise AI Knowledge Management & Work Assistant Platform",
};

/**
 * E01-S016 desktop responsive baseline. Per SOURCE_BASELINE's older
 * E01-S12 baseline ("支援主要 Desktop Resolution" / GA: "Tablet/Mobile
 * optimization"), this MVP story scopes to desktop only — tablet/mobile
 * layout is explicitly out of scope, deferred to GA. This viewport
 * export is still the correct baseline regardless of target device
 * (avoids incorrect browser zoom/DPI handling); it does not by itself
 * commit to mobile support.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
