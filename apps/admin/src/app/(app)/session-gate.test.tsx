import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import SessionGate from "./session-gate";
import { authClient } from "@/lib/auth";
import { useCurrentUser } from "@/lib/session-context";

const { mockReplace, mockRouter, mockPathname } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  return { mockReplace, mockRouter: { replace: mockReplace }, mockPathname: vi.fn() };
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
  usePathname: () => mockPathname(),
}));

const mockedGetSession = vi.mocked(authClient.getSession);

const validSession = {
  userId: "u1",
  roles: ["super_administrator"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function ProbeCurrentUser() {
  const user = useCurrentUser();
  return <p>Signed in as {user.userId}</p>;
}

beforeEach(() => {
  mockedGetSession.mockReset();
  mockReplace.mockReset();
  mockPathname.mockReset();
  mockPathname.mockReturnValue("/");
});

describe("SessionGate (E11-S026)", () => {
  it("shows a loading state while the session check is pending", () => {
    mockedGetSession.mockReturnValue(new Promise(() => {}));

    render(
      <SessionGate>
        <p>protected content</p>
      </SessionGate>,
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("renders children with the current-user context once a session is confirmed", async () => {
    mockedGetSession.mockResolvedValue({ ok: true, value: validSession });

    render(
      <SessionGate>
        <ProbeCurrentUser />
      </SessionGate>,
    );

    expect(await screen.findByText("Signed in as u1")).toBeInTheDocument();
  });

  it("redirects to /login with the current path as returnUrl when there is no session", async () => {
    mockPathname.mockReturnValue("/users");
    mockedGetSession.mockResolvedValue({ ok: true, value: null });

    render(
      <SessionGate>
        <p>protected content</p>
      </SessionGate>,
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login?returnUrl=%2Fusers"));
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("shows a distinct error state (not a login redirect) when the session check fails", async () => {
    mockedGetSession.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(
      <SessionGate>
        <p>protected content</p>
      </SessionGate>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入使用者資訊");
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("calls getSession exactly once per mount", async () => {
    mockedGetSession.mockResolvedValue({ ok: true, value: validSession });

    render(
      <SessionGate>
        <p>protected content</p>
      </SessionGate>,
    );

    await screen.findByText("protected content");
    expect(mockedGetSession).toHaveBeenCalledTimes(1);
  });
});
