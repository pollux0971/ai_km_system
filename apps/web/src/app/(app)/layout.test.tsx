import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShellLayout from "./layout";
import { authClient } from "@/lib/auth";

const { mockReplace, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  // Stable reference — see session-gate.test.tsx for why this matters.
  return { mockReplace, mockRouter: { replace: mockReplace } };
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
  usePathname: () => "/",
}));

const mockedGetSession = vi.mocked(authClient.getSession);

beforeEach(() => {
  mockedGetSession.mockReset();
  mockReplace.mockReset();
});

describe("AppShellLayout", () => {
  it("wires SessionGate around AppShell(children) — chrome + page content render once a session resolves (gating detail lives in session-gate.test.tsx, chrome detail in _components/*.test.tsx)", async () => {
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
  });
});
