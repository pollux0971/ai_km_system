import type { ReactNode } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

/** E01-S005: the sidebar/header/main frame around every authenticated page. */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Header />
        <main style={{ flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}
