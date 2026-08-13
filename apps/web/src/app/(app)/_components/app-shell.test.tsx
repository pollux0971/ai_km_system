import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShell from "./app-shell";
import { CurrentUserProvider } from "@/lib/session-context";

vi.mock("@/lib/auth", () => ({
  authClient: {
    login: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const session = {
  userId: "u1",
  roles: ["general_user"],
  expiresAt: "2099-01-01T00:00:00.000Z",
};

describe("AppShell", () => {
  it("renders the sidebar, header, and page content together", () => {
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
  });
});
