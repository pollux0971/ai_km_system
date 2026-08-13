import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UserMenu from "./user-menu";
import { authClient } from "@/lib/auth";
import { CurrentUserProvider } from "@/lib/session-context";

const { mockReplace, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
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
}));

const mockedLogout = vi.mocked(authClient.logout);

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

function renderUserMenu() {
  return render(
    <CurrentUserProvider value={session}>
      <UserMenu />
    </CurrentUserProvider>,
  );
}

beforeEach(() => {
  mockedLogout.mockReset();
  mockReplace.mockReset();
});

describe("UserMenu", () => {
  it("shows the current user's id as the trigger", () => {
    renderUserMenu();

    expect(screen.getByRole("button", { name: "u1" })).toBeInTheDocument();
  });

  it("opens the menu (revealing 登出) when the trigger is clicked", () => {
    renderUserMenu();

    expect(screen.queryByRole("menuitem", { name: "登出" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "u1" }));

    expect(screen.getByRole("menuitem", { name: "登出" })).toBeInTheDocument();
  });

  it("logs out and redirects to /login when 登出 is clicked", async () => {
    let resolveLogout: (value: { ok: true; value: undefined }) => void = () => {};
    mockedLogout.mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = resolve;
      }),
    );
    renderUserMenu();
    fireEvent.click(screen.getByRole("button", { name: "u1" }));

    fireEvent.click(screen.getByRole("menuitem", { name: "登出" }));

    expect(await screen.findByRole("menuitem", { name: "登出中…" })).toBeDisabled();
    expect(mockReplace).not.toHaveBeenCalled();

    resolveLogout({ ok: true, value: undefined });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });
});
