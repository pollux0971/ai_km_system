import type { ReactNode } from "react";

export const metadata = {
  title: "AI KM Admin",
  description: "AI KM Admin Console",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
