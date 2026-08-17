import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import GroupManagement from "./group-management";
import { createGroup, listGroups } from "@/lib/groups";

vi.mock("@/lib/groups", () => ({
  listGroups: vi.fn(),
  createGroup: vi.fn(),
}));

const mockedListGroups = vi.mocked(listGroups);
const mockedCreateGroup = vi.mocked(createGroup);

beforeEach(() => {
  mockedListGroups.mockReset();
  mockedCreateGroup.mockReset();
});

describe("GroupManagement (E11-S010)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListGroups.mockReturnValue(new Promise(() => {}));

    render(<GroupManagement />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListGroups.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<GroupManagement />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there are no groups", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [] });

    render(<GroupManagement />);

    expect(await screen.findByText("尚無群組。")).toBeInTheDocument();
  });

  it("shows every seeded group's name once loaded", async () => {
    mockedListGroups.mockResolvedValue({
      ok: true,
      value: [
        { groupId: "g1", name: "一般使用者群組" },
        { groupId: "g2", name: "維修工程師群組" },
        { groupId: "g3", name: "業務群組" },
      ],
    });

    render(<GroupManagement />);

    expect(await screen.findByText("一般使用者群組")).toBeInTheDocument();
    expect(screen.getByText("維修工程師群組")).toBeInTheDocument();
    expect(screen.getByText("業務群組")).toBeInTheDocument();
  });

  it("renders every group it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const names = ["一般使用者群組", "維修工程師群組", "業務群組", "稽核群組", "資訊群組", "AI 群組"];
    mockedListGroups.mockResolvedValue({
      ok: true,
      value: names.map((name, index) => ({ groupId: `g${index}`, name })),
    });

    render(<GroupManagement />);

    await screen.findByText("一般使用者群組");
    for (const name of names) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("does not show the empty state once groups are loaded", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [{ groupId: "g1", name: "一般使用者群組" }] });

    render(<GroupManagement />);

    await screen.findByText("一般使用者群組");
    expect(screen.queryByText("尚無群組。")).not.toBeInTheDocument();
  });

  it("keeps the create button disabled while the name field is empty", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [{ groupId: "g1", name: "一般使用者群組" }] });

    render(<GroupManagement />);
    await screen.findByText("一般使用者群組");

    fireEvent.change(screen.getByLabelText("群組名稱"), { target: { value: "   " } });

    expect(screen.getByRole("button", { name: "新增群組" })).toBeDisabled();
  });

  it("creates a new group, shows it in the list without a page reload, and clears the input", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [{ groupId: "g1", name: "一般使用者群組" }] });
    mockedCreateGroup.mockResolvedValue({ ok: true, value: { groupId: "g2", name: "稽核群組" } });

    render(<GroupManagement />);
    await screen.findByText("一般使用者群組");

    fireEvent.change(screen.getByLabelText("群組名稱"), { target: { value: "  稽核群組  " } });
    fireEvent.click(screen.getByRole("button", { name: "新增群組" }));

    expect(mockedCreateGroup).toHaveBeenCalledWith({ name: "稽核群組" });
    expect(await screen.findByText("稽核群組")).toBeInTheDocument();
    expect(screen.getByText("一般使用者群組")).toBeInTheDocument();
    expect(screen.getByLabelText("群組名稱")).toHaveValue("");
  });

  it("shows a distinct error message and keeps the entered draft when creation fails", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [{ groupId: "g1", name: "一般使用者群組" }] });
    mockedCreateGroup.mockResolvedValue({ ok: false, error: { code: "VALIDATION_ERROR", message: "請輸入群組名稱。" } });

    render(<GroupManagement />);
    await screen.findByText("一般使用者群組");

    fireEvent.change(screen.getByLabelText("群組名稱"), { target: { value: "稽核群組" } });
    fireEvent.click(screen.getByRole("button", { name: "新增群組" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("新增失敗，請稍後再試。");
    expect(screen.getByLabelText("群組名稱")).toHaveValue("稽核群組");
  });

  it("disables the create button and input while the creation is in flight, preventing a double submit", async () => {
    mockedListGroups.mockResolvedValue({ ok: true, value: [{ groupId: "g1", name: "一般使用者群組" }] });
    let resolveCreate!: (value: Awaited<ReturnType<typeof createGroup>>) => void;
    mockedCreateGroup.mockReturnValue(new Promise((resolve) => (resolveCreate = resolve)));

    render(<GroupManagement />);
    await screen.findByText("一般使用者群組");

    fireEvent.change(screen.getByLabelText("群組名稱"), { target: { value: "稽核群組" } });
    fireEvent.click(screen.getByRole("button", { name: "新增群組" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "新增群組" })).toBeDisabled());
    expect(screen.getByLabelText("群組名稱")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "新增群組" }));

    resolveCreate({ ok: true, value: { groupId: "g2", name: "稽核群組" } });
    await waitFor(() => expect(mockedCreateGroup).toHaveBeenCalledTimes(1));
  });
});
