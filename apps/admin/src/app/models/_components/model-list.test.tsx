import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ModelList from "./model-list";
import { enableModel, listModels } from "@/lib/models";

vi.mock("@/lib/models", () => ({
  listModels: vi.fn(),
  disableModel: vi.fn(),
  enableModel: vi.fn(),
}));

const mockedListModels = vi.mocked(listModels);
const mockedEnableModel = vi.mocked(enableModel);

beforeEach(() => {
  mockedListModels.mockReset();
  mockedEnableModel.mockReset();
});

describe("ModelList (E11-S013)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListModels.mockReturnValue(new Promise(() => {}));

    render(<ModelList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListModels.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<ModelList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows every seeded model's own label and status once loaded", async () => {
    mockedListModels.mockResolvedValue({
      ok: true,
      value: [
        { id: "standard", label: "標準模型（地端）", status: "enabled" },
        { id: "advanced-local", label: "進階模型（地端）", status: "enabled" },
        { id: "cloud", label: "雲端模型", status: "disabled" },
      ],
    });

    render(<ModelList />);

    expect(await screen.findByText("標準模型（地端）")).toBeInTheDocument();
    expect(screen.getByText("進階模型（地端）")).toBeInTheDocument();
    expect(screen.getByText("雲端模型")).toBeInTheDocument();
    expect(screen.getAllByText("啟用中")).toHaveLength(2);
    expect(screen.getAllByText("已停用")).toHaveLength(1);
  });

  it("renders a status toggle button for each model, targeting its own id", async () => {
    mockedListModels.mockResolvedValue({
      ok: true,
      value: [
        { id: "standard", label: "標準模型（地端）", status: "enabled" },
        { id: "cloud", label: "雲端模型", status: "disabled" },
      ],
    });

    render(<ModelList />);
    await screen.findByText("標準模型（地端）");

    const disableButtons = screen.getAllByRole("button", { name: "停用" });
    const enableButtons = screen.getAllByRole("button", { name: "啟用" });
    expect(disableButtons).toHaveLength(1);
    expect(enableButtons).toHaveLength(1);
  });

  it("re-fetches the list after a successful toggle, reflecting the model's new status", async () => {
    mockedListModels.mockResolvedValueOnce({
      ok: true,
      value: [{ id: "cloud", label: "雲端模型", status: "disabled" }],
    });
    mockedEnableModel.mockResolvedValue({ ok: true, value: { id: "cloud", label: "雲端模型", status: "enabled" } });

    render(<ModelList />);
    await screen.findByText("雲端模型");
    expect(screen.getByText("已停用")).toBeInTheDocument();

    mockedListModels.mockResolvedValueOnce({
      ok: true,
      value: [{ id: "cloud", label: "雲端模型", status: "enabled" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    expect(await screen.findByText("啟用中")).toBeInTheDocument();
    expect(mockedListModels).toHaveBeenCalledTimes(2);
  });
});
