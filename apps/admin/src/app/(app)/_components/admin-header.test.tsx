import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminHeader from "./admin-header";
import { authClient } from "@/lib/auth";
import { CurrentUserProvider } from "@/lib/session-context";

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }));

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const mockedLogout = vi.mocked(authClient.logout);

const session = { userId: "demo-super", roles: ["super_administrator"], expiresAt: "2099-01-01T00:00:00.000Z" };

describe("AdminHeader (E11-S026 logout)", () => {
  it("shows the current user id", () => {
    render(
      <CurrentUserProvider value={session}>
        <AdminHeader />
      </CurrentUserProvider>,
    );

    expect(screen.getByText("demo-super")).toBeInTheDocument();
  });

  it("calls authClient.logout and redirects to /login on click", async () => {
    mockedLogout.mockResolvedValue({ ok: true, value: undefined });
    render(
      <CurrentUserProvider value={session}>
        <AdminHeader />
      </CurrentUserProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "登出" }));

    await waitFor(() => expect(mockedLogout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/login"));
  });

  it("disables the logout button while the request is pending", async () => {
    let resolveLogout: (value: { ok: true; value: undefined }) => void = () => {};
    mockedLogout.mockReturnValue(
      new Promise((resolve) => {
        resolveLogout = resolve;
      }),
    );
    render(
      <CurrentUserProvider value={session}>
        <AdminHeader />
      </CurrentUserProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "登出" }));

    const pendingButton = await screen.findByRole("button", { name: "登出中…" });
    expect(pendingButton).toBeDisabled();

    resolveLogout({ ok: true, value: undefined });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });
});
