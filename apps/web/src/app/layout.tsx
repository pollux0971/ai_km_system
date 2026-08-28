import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
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
 * E01-S022 (ADR 0006): self-hosted fonts, loaded via `next/font/local` so the
 * on-prem build never reaches out to fonts.googleapis.com/fonts.gstatic.com.
 * `next/font/local` inlines the woff2 as a build asset and handles preload +
 * `font-display: swap` (no FOUT) automatically. Each becomes a CSS custom
 * property on `<html>`; `globals.css`'s font-family declaration reads these
 * (per this story's coordination note with E01-S021: whichever of the two
 * merges first defines `--font-*`, the other references it).
 */
const notoSansTC = localFont({
  src: "./fonts/NotoSansTC[wght].woff2",
  variable: "--font-noto-sans-tc",
  display: "swap",
  // The font's own default is wght 100 (Thin) — every consumer must still set
  // font-weight explicitly (see fonts/LICENSES.md); this range only tells
  // next/font/local how much of the variable axis to keep available.
  weight: "100 900",
});

const roboto = localFont({
  src: "./fonts/Roboto[wdth,wght].woff2",
  variable: "--font-roboto",
  display: "swap",
  weight: "100 900",
});

const materialSymbolsOutlined = localFont({
  src: "./fonts/MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].woff2",
  variable: "--font-material-symbols",
  display: "swap",
  weight: "100 700",
});

/**
 * Application bootstrap root (E01-S001). Route skeleton splits below this
 * into a (public) zone (login) and an (app) zone (authenticated shell) —
 * see apps/web/src/app/(public) and apps/web/src/app/(app).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant" className={`${notoSansTC.variable} ${roboto.variable} ${materialSymbolsOutlined.variable}`}>
      <body>{children}</body>
    </html>
  );
}
