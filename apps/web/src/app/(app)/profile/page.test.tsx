import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ProfilePage from "./page";
import { CurrentUserProvider } from "@/lib/session-context";

describe("ProfilePage", () => {
  it("shows name/email/department/group/role when all profile fields are present", () => {
    const session = {
      userId: "u1",
      roles: ["maintenance_engineer"],
      expiresAt: "2099-01-01T00:00:00.000Z",
      name: "王小明",
      email: "wang@example.com",
      department: "維修部",
      group: "維修工程師群組",
    };

    render(
      <CurrentUserProvider value={session}>
        <ProfilePage />
      </CurrentUserProvider>,
    );

    expect(screen.getByRole("heading", { name: "個人資料", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("王小明")).toBeInTheDocument();
    expect(screen.getByText("wang@example.com")).toBeInTheDocument();
    expect(screen.getByText("維修部")).toBeInTheDocument();
    expect(screen.getByText("維修工程師群組")).toBeInTheDocument();
    expect(screen.getByText("維修工程師")).toBeInTheDocument();
  });

  it("falls back to 未提供 for missing optional profile fields instead of rendering blank", () => {
    const session = {
      userId: "u1",
      roles: ["general_user"],
      expiresAt: "2099-01-01T00:00:00.000Z",
    };

    render(
      <CurrentUserProvider value={session}>
        <ProfilePage />
      </CurrentUserProvider>,
    );

    const notProvided = screen.getAllByText("未提供");
    expect(notProvided.length).toBe(4);
    expect(screen.getByText("一般使用者")).toBeInTheDocument();
  });
});
