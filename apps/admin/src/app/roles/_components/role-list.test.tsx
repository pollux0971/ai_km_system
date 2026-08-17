import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RoleList from "./role-list";
import { listRoles } from "@/lib/roles";

vi.mock("@/lib/roles", () => ({
  listRoles: vi.fn(),
}));

const mockedListRoles = vi.mocked(listRoles);

describe("RoleList (E11-S006)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListRoles.mockReturnValue(new Promise(() => {}));

    render(<RoleList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListRoles.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<RoleList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no roles", async () => {
    mockedListRoles.mockResolvedValue({ ok: true, value: [] });

    render(<RoleList />);

    expect(await screen.findByText("尚無角色。")).toBeInTheDocument();
  });

  it("shows each role's own identifier and description once loaded", async () => {
    mockedListRoles.mockResolvedValue({
      ok: true,
      value: [
        { role: "general_user", description: "一般企業員工。" },
        { role: "super_administrator", description: "最高系統權限。" },
      ],
    });

    render(<RoleList />);

    expect(await screen.findByText("general_user")).toBeInTheDocument();
    expect(screen.getByText("一般企業員工。")).toBeInTheDocument();
    expect(screen.getByText("super_administrator")).toBeInTheDocument();
    expect(screen.getByText("最高系統權限。")).toBeInTheDocument();
  });

  it("does not show the empty state once roles are loaded", async () => {
    mockedListRoles.mockResolvedValue({
      ok: true,
      value: [{ role: "general_user", description: "一般企業員工。" }],
    });

    render(<RoleList />);

    await screen.findByText("general_user");
    expect(screen.queryByText("尚無角色。")).not.toBeInTheDocument();
  });
});
