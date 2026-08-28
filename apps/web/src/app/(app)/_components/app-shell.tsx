"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Icon } from "@ai-km/ui";
import Sidebar from "./sidebar";
import Header from "./header";

type NavMode = "drawer" | "rail" | "modal";

/**
 * E01-S023 (ADR 0006): M3 navigation breakpoints — >=1240 is an expanded
 * navigation drawer, 840-1239 is a rail (icon + short label), <840 is a
 * modal drawer opened by a hamburger button.
 */
function computeNavMode(width: number): NavMode {
  if (width >= 1240) return "drawer";
  if (width >= 840) return "rail";
  return "modal";
}

/**
 * E01-S005: the sidebar/header/main frame around every authenticated page.
 * ux/enterprise-polish: layout moved to globals.css classes — the shell is
 * now a fixed-viewport flex frame whose .app-main region is the single
 * scroll container (so the sidebar's history rail can scroll
 * independently, ChatGPT-style).
 *
 * E01-S023 adds `data-nav-mode` (read by globals.css to switch between
 * drawer/rail/modal presentation) and, for the <840 modal case, a
 * hamburger button + scrim. `navMode` starts `undefined` and is only ever
 * set inside an effect — the server (and the client's very first paint)
 * render without the attribute at all, so there's no SSR/hydration
 * mismatch; it's added right after mount, same pattern as
 * NotificationCenter's own "loading" initial state. The sidebar itself is
 * never unmounted across modes — only a wrapper class changes — so its
 * existing tests (which don't touch nav mode) stay unaffected in every
 * mode jsdom's default viewport happens to compute.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const [navMode, setNavMode] = useState<NavMode | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function update() {
      setNavMode(computeNavMode(window.innerWidth));
    }
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Leaving modal mode (e.g. the window was resized wider while the
  // drawer was open) always closes it — there is no scrim/hamburger to
  // close it with once the mode changes.
  useEffect(() => {
    if (navMode !== "modal") {
      setDrawerOpen(false);
    }
  }, [navMode]);

  function closeDrawer() {
    setDrawerOpen(false);
    hamburgerRef.current?.focus();
  }

  useEffect(() => {
    if (!drawerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeDrawer();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  const isModal = navMode === "modal";

  return (
    <div className="app-shell" data-nav-mode={navMode}>
      {isModal && (
        <button
          type="button"
          ref={hamburgerRef}
          className="app-shell-hamburger"
          aria-expanded={drawerOpen}
          aria-label="開啟導覽選單"
          onClick={() => setDrawerOpen((value) => !value)}
        >
          <Icon name="menu" />
        </button>
      )}
      {isModal && drawerOpen && (
        <div className="app-shell-scrim" onClick={closeDrawer} data-testid="app-shell-scrim" />
      )}
      <div className={isModal ? `app-sidebar-modal${drawerOpen ? " app-sidebar-modal--open" : ""}` : undefined}>
        <Sidebar />
      </div>
      <div className="app-content">
        <Header />
        <div className="app-main">{children}</div>
      </div>
    </div>
  );
}
