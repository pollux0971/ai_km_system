import type { ReactNode } from "react";
import Sidebar from "./sidebar";
import Header from "./header";

/**
 * E01-S005: the sidebar/header/main frame around every authenticated page.
 * ux/enterprise-polish: layout moved to globals.css classes — the shell is
 * now a fixed-viewport flex frame whose .app-main region is the single
 * scroll container (so the sidebar's history rail can scroll
 * independently, ChatGPT-style).
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-content">
        <Header />
        <div className="app-main">{children}</div>
      </div>
    </div>
  );
}
