import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UserList from "./user-list";
import { listUsers } from "@/lib/users";

vi.mock("@/lib/users", () => ({
  listUsers: vi.fn(),
}));

const mockedListUsers = vi.mocked(listUsers);

describe("UserList (E11-S002)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListUsers.mockReturnValue(new Promise(() => {}));

    render(<UserList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListUsers.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<UserList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no users", async () => {
    mockedListUsers.mockResolvedValue({ ok: true, value: [] });

    render(<UserList />);

    expect(await screen.findByText("尚無使用者。")).toBeInTheDocument();
  });

  it("shows each user's name, email, department, roles, and status once loaded", async () => {
    mockedListUsers.mockResolvedValue({
      ok: true,
      value: [
        {
          userId: "u1",
          name: "示範使用者",
          email: "demo-user@example.com",
          department: "資訊部",
          roles: ["general_user"],
          status: "active",
          createdAt: "2026-01-15T02:00:00.000Z",
        },
        {
          userId: "u2",
          name: "示範已停用帳號",
          email: "demo-disabled@example.com",
          department: "業務部",
          roles: ["sales_purchasing"],
          status: "disabled",
          createdAt: "2026-03-10T08:45:00.000Z",
        },
      ],
    });

    render(<UserList />);

    expect(await screen.findByText("示範使用者")).toBeInTheDocument();
    expect(screen.getByText("demo-user@example.com")).toBeInTheDocument();
    expect(screen.getByText("資訊部")).toBeInTheDocument();
    expect(screen.getByText("啟用中")).toBeInTheDocument();

    expect(screen.getByText("示範已停用帳號")).toBeInTheDocument();
    expect(screen.getByText("已停用")).toBeInTheDocument();
  });

  it("does not show the empty state once users are loaded", async () => {
    mockedListUsers.mockResolvedValue({
      ok: true,
      value: [
        {
          userId: "u1",
          name: "示範使用者",
          email: "demo-user@example.com",
          department: "資訊部",
          roles: ["general_user"],
          status: "active",
          createdAt: "2026-01-15T02:00:00.000Z",
        },
      ],
    });

    render(<UserList />);

    await screen.findByText("示範使用者");
    expect(screen.queryByText("尚無使用者。")).not.toBeInTheDocument();
  });
});

describe("UserList links to detail pages (E11-S003)", () => {
  it("links each user's own row to its /users/{id} detail page, now that route exists", async () => {
    mockedListUsers.mockResolvedValue({
      ok: true,
      value: [
        {
          userId: "u1",
          name: "示範使用者",
          email: "demo-user@example.com",
          department: "資訊部",
          roles: ["general_user"],
          status: "active",
          createdAt: "2026-01-15T02:00:00.000Z",
        },
      ],
    });

    render(<UserList />);

    const link = await screen.findByRole("link", { name: /示範使用者/ });
    expect(link).toHaveAttribute("href", "/users/u1");
  });
});
