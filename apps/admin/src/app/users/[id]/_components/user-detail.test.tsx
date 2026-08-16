import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import UserDetail from "./user-detail";
import { getUser } from "@/lib/users";

vi.mock("@/lib/users", () => ({
  getUser: vi.fn(),
}));

const mockedGetUser = vi.mocked(getUser);

const sampleUser = {
  userId: "u1",
  name: "示範使用者",
  email: "demo-user@example.com",
  department: "資訊部",
  roles: ["general_user" as const],
  status: "active" as const,
  createdAt: "2026-01-15T02:00:00.000Z",
};

describe("UserDetail (E11-S003)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetUser.mockReturnValue(new Promise(() => {}));

    render(<UserDetail userId="u1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetUser.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<UserDetail userId="u1" />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown user id", async () => {
    mockedGetUser.mockResolvedValue({ ok: true, value: null });

    render(<UserDetail userId="not-a-real-id" />);

    expect(await screen.findByText("找不到這個使用者。")).toBeInTheDocument();
  });

  it("shows the user's name, email, department, roles, status, and creation date once loaded", async () => {
    mockedGetUser.mockResolvedValue({ ok: true, value: sampleUser });

    render(<UserDetail userId="u1" />);

    expect(await screen.findByRole("heading", { name: "示範使用者", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("demo-user@example.com")).toBeInTheDocument();
    expect(screen.getByText("資訊部")).toBeInTheDocument();
    expect(screen.getByText("general_user")).toBeInTheDocument();
    expect(screen.getByText("啟用中")).toBeInTheDocument();

    // toLocaleString("zh-TW") inserts a U+2009 thin space before 上午/下午
    // (same normalization erp-query-detail.test.tsx's own equivalent
    // <time> assertion already established).
    const formattedCreatedAt = new Date(sampleUser.createdAt).toLocaleString("zh-TW").replace(/\s+/g, " ");
    expect(screen.getByText(formattedCreatedAt).closest("time")).toHaveAttribute("dateTime", sampleUser.createdAt);
  });

  it("shows disabled status distinctly for a disabled user", async () => {
    mockedGetUser.mockResolvedValue({ ok: true, value: { ...sampleUser, status: "disabled" } });

    render(<UserDetail userId="u1" />);

    expect(await screen.findByText("已停用")).toBeInTheDocument();
    expect(screen.queryByText("啟用中")).not.toBeInTheDocument();
  });

  it("calls getUser with the given userId", async () => {
    mockedGetUser.mockResolvedValue({ ok: true, value: sampleUser });

    render(<UserDetail userId="u1" />);

    await screen.findByRole("heading", { name: "示範使用者", level: 1 });
    expect(mockedGetUser).toHaveBeenCalledWith("u1");
  });
});
