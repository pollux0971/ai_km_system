import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminSidebar from "./admin-sidebar";
import { ADMIN_NAV_GROUPS } from "@/lib/admin-nav";

// AdminSidebar reads usePathname() (active-item highlight), which needs a
// mock outside a real Next.js runtime — same local-mock convention
// apps/web's sidebar.test.tsx uses.
const { mockedUsePathname } = vi.hoisted(() => ({ mockedUsePathname: vi.fn(() => "/") }));
vi.mock("next/navigation", () => ({ usePathname: mockedUsePathname }));

describe("AdminSidebar (ux/admin-ui-overhaul)", () => {
  it("renders a navigation landmark with every grouped entry as a link", () => {
    render(<AdminSidebar />);

    const nav = screen.getByRole("navigation", { name: "管理導覽" });
    for (const group of ADMIN_NAV_GROUPS) {
      for (const item of group.items) {
        const link = screen.getByRole("link", { name: item.label });
        expect(nav).toContainElement(link);
        expect(link).toHaveAttribute("href", item.href);
      }
    }
  });

  it("renders every group title and keeps every group expanded by default", () => {
    const { container } = render(<AdminSidebar />);

    for (const group of ADMIN_NAV_GROUPS) {
      expect(screen.getByText(group.title)).toBeInTheDocument();
    }
    const detailsElements = container.querySelectorAll("details.sidebar-group");
    expect(detailsElements).toHaveLength(ADMIN_NAV_GROUPS.length);
    for (const details of detailsElements) {
      expect(details).toHaveAttribute("open");
    }
  });

  it("renders a home link back to the console root", () => {
    render(<AdminSidebar />);

    expect(screen.getByRole("link", { name: "管理主控台" })).toHaveAttribute("href", "/");
  });

  it("marks the current route's link with aria-current, including nested paths", () => {
    mockedUsePathname.mockReturnValue("/users/u-001");

    render(<AdminSidebar />);

    expect(screen.getByRole("link", { name: "使用者管理" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "角色管理" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "管理主控台" })).not.toHaveAttribute("aria-current");

    mockedUsePathname.mockReturnValue("/");
  });

  it("marks the home link with aria-current on the console root only", () => {
    mockedUsePathname.mockReturnValue("/");

    render(<AdminSidebar />);

    expect(screen.getByRole("link", { name: "管理主控台" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "使用者管理" })).not.toHaveAttribute("aria-current");
  });
});
