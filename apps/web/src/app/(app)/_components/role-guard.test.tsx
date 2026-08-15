import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RoleGuard } from "./role-guard";
import { CurrentUserProvider } from "@/lib/session-context";

const mockUsePathname = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

function renderGuardAs(roles: string[], pathname: string) {
  const session = { userId: "u1", roles, expiresAt: "2099-01-01T00:00:00.000Z" };
  mockUsePathname.mockReturnValue(pathname);

  return render(
    <CurrentUserProvider value={session}>
      <RoleGuard>
        <p>protected content</p>
      </RoleGuard>
    </CurrentUserProvider>,
  );
}

describe("RoleGuard (E01-S017)", () => {
  it("renders children on a role-restricted route when the user has the required role", () => {
    renderGuardAs(["maintenance_engineer"], "/maintenance");

    expect(screen.getByText("protected content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a 403 message instead of children on a role-restricted route when the user lacks the role", () => {
    renderGuardAs(["general_user"], "/maintenance");

    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("您沒有權限執行此操作。");
  });

  it("renders children on an 'all roles' route regardless of role", () => {
    renderGuardAs(["general_user"], "/knowledge");

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("renders children on a route not listed in NAV_ITEMS at all (e.g. /profile)", () => {
    renderGuardAs(["general_user"], "/profile");

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("denies a sales_purchasing user on /maintenance (role list is exact, not just 'has any restricted role')", () => {
    renderGuardAs(["sales_purchasing"], "/maintenance");
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
  });

  it("allows a sales_purchasing user on /erp", () => {
    renderGuardAs(["sales_purchasing"], "/erp");
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });

  it("(E07-S006) denies a general_user on a route nested under /maintenance, not just the bare /maintenance path itself", () => {
    renderGuardAs(["general_user"], "/maintenance/case-sample-1/session");
    expect(screen.queryByText("protected content")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("您沒有權限執行此操作。");
  });

  it("(E07-S006) allows a maintenance_engineer on a route nested under /maintenance", () => {
    renderGuardAs(["maintenance_engineer"], "/maintenance/case-sample-1/session");
    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});
