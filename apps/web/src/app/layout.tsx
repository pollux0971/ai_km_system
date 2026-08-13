import type { ReactNode } from "react";

export const metadata = {
  title: "AI KM",
  description: "Enterprise AI Knowledge Management & Work Assistant Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
