import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Sidebar from "./sidebar";
import { CurrentUserProvider } from "@/lib/session-context";

function renderSidebarAs(roles: string[]) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  return render(
    <CurrentUserProvider value={session}>
      <Sidebar />
    </CurrentUserProvider>,
  );
}

describe("Sidebar", () => {
  it("renders a navigation landmark with a Home link for any authenticated user", () => {
    renderSidebarAs(["general_user"]);

    const nav = screen.getByRole("navigation", { name: "主導覽" });
    const homeLink = screen.getByRole("link", { name: "首頁" });

    expect(nav).toContainElement(homeLink);
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("does not show Maintenance/ERP links to a general_user", () => {
    renderSidebarAs(["general_user"]);

    expect(screen.queryByRole("link", { name: "維修助手" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "ERP 助手" })).not.toBeInTheDocument();
  });

  it("shows the Maintenance link to a maintenance_engineer", () => {
    renderSidebarAs(["maintenance_engineer"]);

    expect(screen.getByRole("link", { name: "維修助手" })).toHaveAttribute("href", "/maintenance");
    expect(screen.queryByRole("link", { name: "ERP 助手" })).not.toBeInTheDocument();
  });

  it("shows the ERP link to a sales_purchasing user", () => {
    renderSidebarAs(["sales_purchasing"]);

    expect(screen.getByRole("link", { name: "ERP 助手" })).toHaveAttribute("href", "/erp");
    expect(screen.queryByRole("link", { name: "維修助手" })).not.toBeInTheDocument();
  });
});
