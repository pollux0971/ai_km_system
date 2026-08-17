import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ModelStatusToggle from "./model-status-toggle";
import { disableModel, enableModel, type ModelOption } from "@/lib/models";

vi.mock("@/lib/models", () => ({
  disableModel: vi.fn(),
  enableModel: vi.fn(),
}));

const mockedDisable = vi.mocked(disableModel);
const mockedEnable = vi.mocked(enableModel);

function sampleModel(overrides: Partial<Pick<ModelOption, "id" | "status">> = {}): ModelOption {
  return {
    id: "standard",
    label: "標準模型（地端）",
    status: "enabled",
    ...overrides,
  };
}

beforeEach(() => {
  mockedDisable.mockReset();
  mockedEnable.mockReset();
});

describe("ModelStatusToggle (E11-S013)", () => {
  it("shows 停用 when status is enabled", () => {
    render(<ModelStatusToggle modelId="standard" status="enabled" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "啟用" })).not.toBeInTheDocument();
  });

  it("shows 啟用 when status is disabled", () => {
    render(<ModelStatusToggle modelId="cloud" status="disabled" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用" })).not.toBeInTheDocument();
  });

  it("clicking 停用 calls disableModel (not enableModel) and calls onToggled on success", async () => {
    mockedDisable.mockResolvedValue({ ok: true, value: sampleModel({ status: "disabled" }) });
    const onToggled = vi.fn();
    render(<ModelStatusToggle modelId="standard" status="enabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() => expect(mockedDisable).toHaveBeenCalledWith("standard"));
    expect(mockedEnable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("clicking 啟用 calls enableModel (not disableModel) and calls onToggled on success", async () => {
    mockedEnable.mockResolvedValue({ ok: true, value: sampleModel({ id: "cloud", status: "enabled" }) });
    const onToggled = vi.fn();
    render(<ModelStatusToggle modelId="cloud" status="disabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    await waitFor(() => expect(mockedEnable).toHaveBeenCalledWith("cloud"));
    expect(mockedDisable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("shows a distinct error message, keeps the 停用 label, and does not call onToggled when disabling fails", async () => {
    mockedDisable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個模型。" } });
    const onToggled = vi.fn();
    render(<ModelStatusToggle modelId="standard" status="enabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("停用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(onToggled).not.toHaveBeenCalled();
  });

  it("shows a distinct error message and keeps the 啟用 label when enabling fails", async () => {
    mockedEnable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個模型。" } });
    render(<ModelStatusToggle modelId="cloud" status="disabled" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("啟用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
  });

  it("disables the button while the toggle is in flight, preventing a double click", async () => {
    let resolveDisable!: (value: Awaited<ReturnType<typeof disableModel>>) => void;
    mockedDisable.mockReturnValue(new Promise((resolve) => (resolveDisable = resolve)));
    render(<ModelStatusToggle modelId="standard" status="enabled" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));
    expect(screen.getByRole("button", { name: "停用" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    resolveDisable({ ok: true, value: sampleModel({ status: "disabled" }) });
    await waitFor(() => expect(mockedDisable).toHaveBeenCalledTimes(1));
  });
});
