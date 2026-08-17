import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RoleEditor from "./role-editor";
import { getRole, updateRoleDescription } from "@/lib/roles";

vi.mock("@/lib/roles", () => ({
  getRole: vi.fn(),
  updateRoleDescription: vi.fn(),
}));

const mockedGetRole = vi.mocked(getRole);
const mockedUpdateRoleDescription = vi.mocked(updateRoleDescription);

beforeEach(() => {
  mockedGetRole.mockReset();
  mockedUpdateRoleDescription.mockReset();
});

describe("RoleEditor (E11-S007)", () => {
  it("shows a loading indicator before the role resolves", () => {
    mockedGetRole.mockReturnValue(new Promise(() => {}));

    render(<RoleEditor role="general_user" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetRole.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<RoleEditor role="general_user" />);

    expect(await screen.findByText("無法載入角色資料。")).toBeInTheDocument();
  });

  it("shows a not-found state for a role that doesn't exist", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: null });

    render(<RoleEditor role="not-a-real-role" />);

    expect(await screen.findByText("找不到這個角色。")).toBeInTheDocument();
  });

  it("shows the role identifier and a textarea pre-filled with its current description", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });

    render(<RoleEditor role="general_user" />);

    expect(await screen.findByRole("heading", { name: "general_user", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("角色說明")).toHaveValue("一般企業員工。");
  });

  it("keeps the save button disabled while the description is empty", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });

    render(<RoleEditor role="general_user" />);
    await screen.findByLabelText("角色說明");

    fireEvent.change(screen.getByLabelText("角色說明"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled();
  });

  it("saves the trimmed description and shows the updated value, without navigating away", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });
    mockedUpdateRoleDescription.mockResolvedValue({
      ok: true,
      value: { role: "general_user", description: "更新後的說明。" },
    });

    render(<RoleEditor role="general_user" />);
    await screen.findByLabelText("角色說明");

    fireEvent.change(screen.getByLabelText("角色說明"), { target: { value: "  更新後的說明。  " } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(mockedUpdateRoleDescription).toHaveBeenCalledWith("general_user", "更新後的說明。"));
    expect(await screen.findByText("已儲存。")).toBeInTheDocument();
    expect(screen.getByLabelText("角色說明")).toHaveValue("更新後的說明。");
  });

  it("shows a distinct error message and keeps the entered draft when saving fails", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });
    mockedUpdateRoleDescription.mockResolvedValue({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "請輸入角色說明。" },
    });

    render(<RoleEditor role="general_user" />);
    await screen.findByLabelText("角色說明");

    fireEvent.change(screen.getByLabelText("角色說明"), { target: { value: "草稿內容" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("儲存失敗，請稍後再試。");
    expect(screen.getByLabelText("角色說明")).toHaveValue("草稿內容");
  });

  it("the cancel link points back to /roles", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });

    render(<RoleEditor role="general_user" />);
    await screen.findByLabelText("角色說明");

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/roles");
  });

  it("disables the save button and textarea while the save is in flight, preventing a double submit", async () => {
    mockedGetRole.mockResolvedValue({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });
    let resolveSave!: (value: Awaited<ReturnType<typeof updateRoleDescription>>) => void;
    mockedUpdateRoleDescription.mockReturnValue(new Promise((resolve) => (resolveSave = resolve)));

    render(<RoleEditor role="general_user" />);
    await screen.findByLabelText("角色說明");
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "儲存" })).toBeDisabled());
    expect(screen.getByLabelText("角色說明")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));

    resolveSave({ ok: true, value: { role: "general_user", description: "一般企業員工。" } });
    await waitFor(() => expect(mockedUpdateRoleDescription).toHaveBeenCalledTimes(1));
  });
});
