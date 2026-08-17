import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConnectorStatusToggle from "./connector-status-toggle";
import { disableConnector, enableConnector, type Connector } from "@/lib/connectors";

vi.mock("@/lib/connectors", () => ({
  disableConnector: vi.fn(),
  enableConnector: vi.fn(),
}));

const mockedDisable = vi.mocked(disableConnector);
const mockedEnable = vi.mocked(enableConnector);

function sampleConnector(overrides: Partial<Pick<Connector, "id" | "status">> = {}): Connector {
  return {
    id: "erp",
    name: "ERP 連接器",
    status: "disabled",
    ...overrides,
  };
}

beforeEach(() => {
  mockedDisable.mockReset();
  mockedEnable.mockReset();
});

describe("ConnectorStatusToggle (E11-S014)", () => {
  it("shows 啟用 when status is disabled", () => {
    render(<ConnectorStatusToggle connectorId="erp" status="disabled" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停用" })).not.toBeInTheDocument();
  });

  it("shows 停用 when status is enabled", () => {
    render(<ConnectorStatusToggle connectorId="erp" status="enabled" onToggled={vi.fn()} />);

    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "啟用" })).not.toBeInTheDocument();
  });

  it("clicking 啟用 calls enableConnector (not disableConnector) and calls onToggled on success", async () => {
    mockedEnable.mockResolvedValue({ ok: true, value: sampleConnector({ status: "enabled" }) });
    const onToggled = vi.fn();
    render(<ConnectorStatusToggle connectorId="erp" status="disabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    await waitFor(() => expect(mockedEnable).toHaveBeenCalledWith("erp"));
    expect(mockedDisable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("clicking 停用 calls disableConnector (not enableConnector) and calls onToggled on success", async () => {
    mockedDisable.mockResolvedValue({ ok: true, value: sampleConnector({ status: "disabled" }) });
    const onToggled = vi.fn();
    render(<ConnectorStatusToggle connectorId="erp" status="enabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    await waitFor(() => expect(mockedDisable).toHaveBeenCalledWith("erp"));
    expect(mockedEnable).not.toHaveBeenCalled();
    await waitFor(() => expect(onToggled).toHaveBeenCalledTimes(1));
  });

  it("shows a distinct error message, keeps the 啟用 label, and does not call onToggled when enabling fails", async () => {
    mockedEnable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個連接器。" } });
    const onToggled = vi.fn();
    render(<ConnectorStatusToggle connectorId="erp" status="disabled" onToggled={onToggled} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("啟用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "啟用" })).toBeInTheDocument();
    expect(onToggled).not.toHaveBeenCalled();
  });

  it("shows a distinct error message and keeps the 停用 label when disabling fails", async () => {
    mockedDisable.mockResolvedValue({ ok: false, error: { code: "NOT_FOUND", message: "找不到這個連接器。" } });
    render(<ConnectorStatusToggle connectorId="erp" status="enabled" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "停用" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("停用失敗，請稍後再試。");
    expect(screen.getByRole("button", { name: "停用" })).toBeInTheDocument();
  });

  it("disables the button while the toggle is in flight, preventing a double click", async () => {
    let resolveEnable!: (value: Awaited<ReturnType<typeof enableConnector>>) => void;
    mockedEnable.mockReturnValue(new Promise((resolve) => (resolveEnable = resolve)));
    render(<ConnectorStatusToggle connectorId="erp" status="disabled" onToggled={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "啟用" }));
    expect(screen.getByRole("button", { name: "啟用" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    resolveEnable({ ok: true, value: sampleConnector({ status: "enabled" }) });
    await waitFor(() => expect(mockedEnable).toHaveBeenCalledTimes(1));
  });
});
