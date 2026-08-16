import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NewUserPage from "./page";
import { createUser, type AdminUser } from "@/lib/users";

const { mockReplace, mockRefresh, mockRouter } = vi.hoisted(() => {
  const mockReplace = vi.fn();
  const mockRefresh = vi.fn();
  // Stable reference — see session-gate.test.tsx (apps/web) for why this matters.
  return { mockReplace, mockRefresh, mockRouter: { replace: mockReplace, refresh: mockRefresh } };
});

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/users", async () => {
  const actual = await vi.importActual<typeof import("@/lib/users")>("@/lib/users");
  return { ...actual, createUser: vi.fn() };
});

const mockedCreateUser = vi.mocked(createUser);

const sampleUser = {
  userId: "mock-user-new-1",
  name: "新進使用者",
  email: "new-user@example.com",
  department: "業務部",
  roles: ["sales_purchasing"],
  status: "active",
  createdAt: "2026-08-15T00:00:00.000Z",
} satisfies AdminUser;

beforeEach(() => {
  mockReplace.mockReset();
  mockRefresh.mockReset();
  mockedCreateUser.mockReset();
});

describe("NewUserPage (E11-S004)", () => {
  it("renders name/email/department fields and a checkbox per role, submit disabled until required input is present", () => {
    render(<NewUserPage />);

    expect(screen.getByLabelText("姓名")).toHaveValue("");
    expect(screen.getByLabelText("電子郵件")).toHaveValue("");
    expect(screen.getByLabelText("部門")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "sales_purchasing" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();
  });

  it("keeps the submit button disabled until name, email, department are all non-whitespace and at least one role is checked", () => {
    render(<NewUserPage />);

    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新進使用者" } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "new-user@example.com" } });
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "  " } });
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "業務部" } });
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox", { name: "sales_purchasing" }));
    expect(screen.getByRole("button", { name: "建立" })).toBeEnabled();
  });

  it("unchecking the only selected role disables submit again", () => {
    render(<NewUserPage />);

    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新進使用者" } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "new-user@example.com" } });
    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "業務部" } });
    const checkbox = screen.getByRole("checkbox", { name: "sales_purchasing" });
    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "建立" })).toBeEnabled();

    fireEvent.click(checkbox);
    expect(screen.getByRole("button", { name: "建立" })).toBeDisabled();
  });

  it("the cancel link points back to /users", () => {
    render(<NewUserPage />);

    expect(screen.getByRole("link", { name: "取消" })).toHaveAttribute("href", "/users");
  });

  it("submits the trimmed fields and the checked roles, then redirects to the new user's own detail page and refreshes the router cache", async () => {
    mockedCreateUser.mockResolvedValue({ ok: true, value: sampleUser });

    render(<NewUserPage />);
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "  新進使用者  " } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "  new-user@example.com  " } });
    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "  業務部  " } });
    fireEvent.click(screen.getByRole("checkbox", { name: "sales_purchasing" }));
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/users/mock-user-new-1"));
    expect(mockedCreateUser).toHaveBeenCalledWith({
      name: "新進使用者",
      email: "new-user@example.com",
      department: "業務部",
      roles: ["sales_purchasing"],
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("supports checking more than one role", async () => {
    mockedCreateUser.mockResolvedValue({ ok: true, value: sampleUser });

    render(<NewUserPage />);
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新進使用者" } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "new-user@example.com" } });
    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "業務部" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "sales_purchasing" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "it_administrator" }));
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(mockedCreateUser).toHaveBeenCalled());
    expect(mockedCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["sales_purchasing", "it_administrator"] }),
    );
  });

  it("shows a distinct error alert when creation fails, does not navigate away, and keeps the entered values", async () => {
    mockedCreateUser.mockResolvedValue({
      ok: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "down" },
    });

    render(<NewUserPage />);
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新進使用者" } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "new-user@example.com" } });
    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "業務部" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "sales_purchasing" }));
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("無法建立使用者");
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByLabelText("姓名")).toHaveValue("新進使用者");
    expect(screen.getByRole("checkbox", { name: "sales_purchasing" })).toBeChecked();
  });

  it("disables the submit button and role checkboxes while the request is pending, preventing a double submit", async () => {
    let resolveCreate!: (result: Awaited<ReturnType<typeof createUser>>) => void;
    mockedCreateUser.mockReturnValueOnce(new Promise((resolve) => (resolveCreate = resolve)));

    render(<NewUserPage />);
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新進使用者" } });
    fireEvent.change(screen.getByLabelText("電子郵件"), { target: { value: "new-user@example.com" } });
    fireEvent.change(screen.getByLabelText("部門"), { target: { value: "業務部" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "sales_purchasing" }));
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "建立" })).toBeDisabled());
    expect(screen.getByRole("checkbox", { name: "sales_purchasing" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "建立" }));

    resolveCreate({ ok: true, value: sampleUser });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockedCreateUser).toHaveBeenCalledTimes(1);
  });
});
