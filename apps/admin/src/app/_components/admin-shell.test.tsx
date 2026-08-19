import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminShell from "./admin-shell";

// AdminSidebar (rendered inside the shell) reads usePathname() — same
// mock convention as admin-sidebar.test.tsx.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("AdminShell (ux/admin-ui-overhaul)", () => {
  it("renders the sidebar, header brand with Admin badge, and page content together", () => {
    render(
      <AdminShell>
        <p>page content</p>
      </AdminShell>,
    );

    expect(screen.getByRole("navigation", { name: "管理導覽" })).toBeInTheDocument();
    expect(screen.getByText("AI KM")).toBeInTheDocument();
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByText("page content")).toBeInTheDocument();
  });
});
