import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import AppShell from "./app-shell";
import { CurrentUserProvider } from "@/lib/session-context";

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

// ux/enterprise-polish: Sidebar now also calls usePathname() (history
// rail + active-item highlight) — pure mock addition, assertions below
// unchanged.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/",
}));

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("AppShell", () => {
  it("renders the sidebar, header, and page content together", async () => {
    render(
      <CurrentUserProvider value={session}>
        <AppShell>
          <p>page content</p>
        </AppShell>
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("navigation", { name: "主導覽" })).toBeInTheDocument();
    expect(screen.getByText("AI KM")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
    // Waits out NotificationCenter's own independent async load so it
    // can't log a state-update-after-test warning once this returns.
    expect(await screen.findByRole("button", { name: /^通知/ })).toBeInTheDocument();
  });
});

/**
 * E01-S023: `data-nav-mode` is only ever set inside an effect (see
 * app-shell.tsx's doc comment on why), so every assertion here awaits it
 * rather than reading the very first synchronous render.
 */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
}

async function renderShellAt(width: number) {
  setViewportWidth(width);
  const { container } = render(
    <CurrentUserProvider value={session}>
      <AppShell>
        <p>page content</p>
      </AppShell>
    </CurrentUserProvider>,
  );
  await screen.findByRole("button", { name: /^通知/ });
  const shell = container.querySelector(".app-shell");
  if (!shell) throw new Error("expected .app-shell to be in the document");
  return shell;
}

describe("AppShell nav mode (E01-S023)", () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it("is 'drawer' at >=1240px", async () => {
    const shell = await renderShellAt(1440);
    expect(shell).toHaveAttribute("data-nav-mode", "drawer");
  });

  it("is 'rail' at 840-1239px", async () => {
    const shell = await renderShellAt(1024);
    expect(shell).toHaveAttribute("data-nav-mode", "rail");
  });

  it("is 'modal' below 840px, and renders a hamburger button", async () => {
    const shell = await renderShellAt(600);
    expect(shell).toHaveAttribute("data-nav-mode", "modal");
    expect(screen.getByRole("button", { name: "開啟導覽選單" })).toBeInTheDocument();
  });

  it("does not render a hamburger button at >=840px", async () => {
    await renderShellAt(1024);
    expect(screen.queryByRole("button", { name: "開啟導覽選單" })).not.toBeInTheDocument();
  });
});

describe("AppShell modal drawer interaction (E01-S023, <840px only)", () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  it("opens the drawer when the hamburger is clicked", async () => {
    await renderShellAt(600);
    const hamburger = screen.getByRole("button", { name: "開啟導覽選單" });

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(hamburger);

    expect(hamburger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("app-shell-scrim")).toBeInTheDocument();
  });

  it("closes the drawer and returns focus to the hamburger when Escape is pressed", async () => {
    await renderShellAt(600);
    const hamburger = screen.getByRole("button", { name: "開啟導覽選單" });
    fireEvent.click(hamburger);
    expect(hamburger).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("app-shell-scrim")).not.toBeInTheDocument();
    expect(hamburger).toHaveFocus();
  });

  it("closes the drawer and returns focus to the hamburger when the scrim is clicked", async () => {
    await renderShellAt(600);
    const hamburger = screen.getByRole("button", { name: "開啟導覽選單" });
    fireEvent.click(hamburger);

    fireEvent.click(screen.getByTestId("app-shell-scrim"));

    expect(hamburger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("app-shell-scrim")).not.toBeInTheDocument();
    expect(hamburger).toHaveFocus();
  });
});
