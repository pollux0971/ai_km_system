import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Header from "./header";
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

describe("Header", () => {
  it("renders the app name, notification center, and user-menu trigger (waits for NotificationCenter's own async load to settle — state detail lives in notification-center.test.tsx)", async () => {
    render(
      <CurrentUserProvider value={session}>
        <Header />
      </CurrentUserProvider>,
    );

    expect(screen.getByText("AI KM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "u1" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^通知/ })).toBeInTheDocument();
  });
});
