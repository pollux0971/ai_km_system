import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShellLayout from "./layout";
import { authClient } from "@/lib/auth";

const { mockReplace, mockRouter, mockUsePathname } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  // Stable reference — see session-gate.test.tsx for why this matters.
  return { mockReplace, mockRouter: { replace: mockReplace }, mockUsePathname: vi.fn() };
});

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: mockUsePathname,
}));

const mockedGetSession = vi.mocked(authClient.getSession);

beforeEach(() => {
  mockedGetSession.mockReset();
  mockReplace.mockReset();
  mockUsePathname.mockReturnValue("/");
});

describe("AppShellLayout", () => {
  it("wires SessionGate around AppShell(RoleGuard(children)) — chrome + page content render once a session resolves and the route is allowed (gating detail lives in session-gate.test.tsx, chrome detail in _components/*.test.tsx, 403 detail in _components/role-guard.test.tsx)", async () => {
    mockedGetSession.mockResolvedValue({
      ok: true,
      value: { userId: "u1", roles: ["general_user"], expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    render(
      <AppShellLayout>
        <p>child content</p>
      </AppShellLayout>,
    );

    expect(await screen.findByText("child content")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "主導覽" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "u1" })).toBeInTheDocument();
    // Waits out NotificationCenter's own independent async load so it
    // can't log a state-update-after-test warning once this returns.
    expect(await screen.findByRole("button", { name: /^通知/ })).toBeInTheDocument();
  });

  it("E01-S017: still shows the sidebar/header chrome but replaces page content with a 403 message when the route denies the session's role", async () => {
    mockUsePathname.mockReturnValue("/maintenance");
    mockedGetSession.mockResolvedValue({
      ok: true,
      value: { userId: "u1", roles: ["general_user"], expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    render(
      <AppShellLayout>
        <p>child content</p>
      </AppShellLayout>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("您沒有權限執行此操作。");
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    // Chrome stays visible so the user can navigate elsewhere.
    expect(screen.getByRole("navigation", { name: "主導覽" })).toBeInTheDocument();
  });
});
