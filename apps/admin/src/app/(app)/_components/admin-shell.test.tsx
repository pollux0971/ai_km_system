import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminShell from "./admin-shell";
import { CurrentUserProvider } from "@/lib/session-context";

// AdminSidebar (rendered inside the shell) reads usePathname() — same
// mock convention as admin-sidebar.test.tsx. E11-S026: AdminHeader now
// also reads useRouter() for its logout button.
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: vi.fn() }) }));

const session = { userId: "u1", roles: ["super_administrator"], expiresAt: "2099-01-01T00:00:00.000Z" };

describe("AdminShell (ux/admin-ui-overhaul)", () => {
  it("renders the sidebar, header brand with Admin badge, and page content together", () => {
    render(
      <CurrentUserProvider value={session}>
        <AdminShell>
          <p>page content</p>
        </AdminShell>
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("navigation", { name: "管理導覽" })).toBeInTheDocument();
    expect(screen.getByText("AI KM")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
