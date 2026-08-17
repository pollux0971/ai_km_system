import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DepartmentManagement from "./department-management";
import { createDepartment, listDepartments } from "@/lib/departments";

vi.mock("@/lib/departments", () => ({
  listDepartments: vi.fn(),
  createDepartment: vi.fn(),
}));

const mockedListDepartments = vi.mocked(listDepartments);
const mockedCreateDepartment = vi.mocked(createDepartment);

beforeEach(() => {
  mockedListDepartments.mockReset();
  mockedCreateDepartment.mockReset();
});

describe("DepartmentManagement (E11-S009)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListDepartments.mockReturnValue(new Promise(() => {}));

    render(<DepartmentManagement />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListDepartments.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<DepartmentManagement />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no departments", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [] });

    render(<DepartmentManagement />);

    expect(await screen.findByText("尚無部門。")).toBeInTheDocument();
  });

  it("shows every seeded department's name once loaded", async () => {
    mockedListDepartments.mockResolvedValue({
      ok: true,
      value: [
        { departmentId: "d1", name: "資訊部" },
        { departmentId: "d2", name: "維修部" },
        { departmentId: "d3", name: "業務部" },
        { departmentId: "d4", name: "稽核部" },
      ],
    });

    render(<DepartmentManagement />);

    expect(await screen.findByText("資訊部")).toBeInTheDocument();
    expect(screen.getByText("維修部")).toBeInTheDocument();
    expect(screen.getByText("業務部")).toBeInTheDocument();
    expect(screen.getByText("稽核部")).toBeInTheDocument();
  });

  it("renders every department it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const names = ["資訊部", "維修部", "業務部", "稽核部", "行銷部", "法務部", "人資部"];
    mockedListDepartments.mockResolvedValue({
      ok: true,
      value: names.map((name, index) => ({ departmentId: `d${index}`, name })),
    });

    render(<DepartmentManagement />);

    await screen.findByText("資訊部");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not show the empty state once departments are loaded", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [{ departmentId: "d1", name: "資訊部" }] });

    render(<DepartmentManagement />);

    await screen.findByText("資訊部");
    expect(screen.queryByText("尚無部門。")).not.toBeInTheDocument();
  });

  it("keeps the create button disabled while the name field is empty", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [{ departmentId: "d1", name: "資訊部" }] });

    render(<DepartmentManagement />);
    await screen.findByText("資訊部");

    fireEvent.change(screen.getByLabelText("部門名稱"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "新增部門" })).toBeDisabled();
  });

  it("creates a new department, shows it in the list without a page reload, and clears the input", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [{ departmentId: "d1", name: "資訊部" }] });
    mockedCreateDepartment.mockResolvedValue({ ok: true, value: { departmentId: "d2", name: "行銷部" } });

    render(<DepartmentManagement />);
    await screen.findByText("資訊部");

    fireEvent.change(screen.getByLabelText("部門名稱"), { target: { value: "  行銷部  " } });
    fireEvent.click(screen.getByRole("button", { name: "新增部門" }));

    expect(mockedCreateDepartment).toHaveBeenCalledWith({ name: "行銷部" });
    expect(await screen.findByText("行銷部")).toBeInTheDocument();
    expect(screen.getByText("資訊部")).toBeInTheDocument();
    expect(screen.getByLabelText("部門名稱")).toHaveValue("");
  });

  it("shows a distinct error message and keeps the entered draft when creation fails", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [{ departmentId: "d1", name: "資訊部" }] });
    mockedCreateDepartment.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入部門名稱。" } });

    render(<DepartmentManagement />);
    await screen.findByText("資訊部");

    fireEvent.change(screen.getByLabelText("部門名稱"), { target: { value: "行銷部" } });
    fireEvent.click(screen.getByRole("button", { name: "新增部門" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("新增失敗，請稍後再試。");
    expect(screen.getByLabelText("部門名稱")).toHaveValue("行銷部");
  });

  it("disables the create button and input while the creation is in flight, preventing a double submit", async () => {
    mockedListDepartments.mockResolvedValue({ ok: true, value: [{ departmentId: "d1", name: "資訊部" }] });
    let resolveCreate!: (value: Awaited<ReturnType<typeof createDepartment>>) => void;
    mockedCreateDepartment.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));

    render(<DepartmentManagement />);
    await screen.findByText("資訊部");

    fireEvent.change(screen.getByLabelText("部門名稱"), { target: { value: "行銷部" } });
    fireEvent.click(screen.getByRole("button", { name: "新增部門" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "新增部門" })).toBeDisabled());
    expect(screen.getByLabelText("部門名稱")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "新增部門" }));

    resolveCreate({ ok: true, value: { departmentId: "d2", name: "行銷部" } });
    await waitFor(() => expect(mockedCreateDepartment).toHaveBeenCalledTimes(1));
  });
});
