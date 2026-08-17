import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import UserStatusToggle from "./user-status-toggle";
import { disableUser, enableUser, type AdminUser } from "@/lib/users";

vi.mock("@/lib/users", () => ({
  disableUser: vi.fn(),
  enableUser: vi.fn(),
}));

const mockedDisable = vi.mocked(disableUser);
const mockedEnable = vi.mocked(enableUser);

function sampleUser(overrides: Partial<Pick<AdminUser, "userId" | "status">> = {}): AdminUser {
  return {
    userId: "u1",
    name: "示範使用者",
    email: "demo-user@example.com",
    department: "資訊部",
    roles: ["general_user"],
    status: "active",
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockedDisable.mockReset();
  mockedEnable.mockReset();
});

describe("UserStatusToggle (E11-S005)", () => {
  it("shows 停用 when status is active", () => {
    render(<UserStatusToggle userId="u1" status="active" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "啟用" })).not.toBeInTheDocument();
  });

  it("shows 啟用 when status is disabled", () => {
    render(<UserStatusToggle userId="u1" status="disabled" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用" })).not.toBeInTheDocument();
  });

  it("clicking 停用 calls disableUser (not enableUser) and calls onToggled on success", async () => {
    mockedDisable.mockResolvedValue({ ok: true, value: sampleUser({ status: "disabled" }) });
    const onToggled = vi.fn();
    render(<UserStatusToggle userId="u1" status="active" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() => expect(mockedDisable).toHaveBeenCalledWith("u1"));
    expect(mockedEnable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("clicking 啟用 calls enableUser (not disableUser) and calls onToggled on success", async () => {
    mockedEnable.mockResolvedValue({ ok: true, value: sampleUser({ status: "active" }) });
    const onToggled = vi.fn();
    render(<UserStatusToggle userId="u1" status="disabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    await waitFor(() => expect(mockedEnable).toHaveBeenCalledWith("u1"));
    expect(mockedDisable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("shows a distinct error message, keeps the 停用 label, and does not call onToggled when disabling fails", async () => {
    mockedDisable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個使用者。" } });
    const onToggled = vi.fn();
    render(<UserStatusToggle userId="u1" status="active" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("停用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(onToggled).not.toHaveBeenCalled();
  });

  it("shows a distinct error message and keeps the 啟用 label when enabling fails", async () => {
    mockedEnable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個使用者。" } });
    render(<UserStatusToggle userId="u1" status="disabled" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("啟用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
  });

  it("disables the button while the toggle is in flight, preventing a double click", async () => {
    let resolveDisable!: (value: Awaited<ReturnType<typeof disableUser>>) => void;
    mockedDisable.mockReturnValue(new Promise((resolve) => (resolveDisable = resolve)));
    render(<UserStatusToggle userId="u1" status="active" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    resolveDisable({ ok: true, value: sampleUser({ status: "disabled" }) });
    await waitFor(() => expect(mockedDisable).toHaveBeenCalledTimes(1));
  });
});
