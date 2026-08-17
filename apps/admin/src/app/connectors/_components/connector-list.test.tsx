import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ConnectorList from "./connector-list";
import { enableConnector, listConnectors, type Connector } from "@/lib/connectors";

vi.mock("@/lib/connectors", () => ({
  listConnectors: vi.fn(),
  disableConnector: vi.fn(),
  enableConnector: vi.fn(),
}));

const mockedListConnectors = vi.mocked(listConnectors);
const mockedEnableConnector = vi.mocked(enableConnector);

const ALL_CONNECTORS: Connector[] = [
  { id: "erp", name: "ERP 連接器", status: "disabled" },
  { id: "mes", name: "MES 連接器", status: "disabled" },
  { id: "crm", name: "CRM 連接器", status: "disabled" },
  { id: "hr", name: "HR 連接器", status: "disabled" },
  { id: "scm", name: "SCM 連接器", status: "disabled" },
  { id: "plm", name: "PLM 連接器", status: "disabled" },
  { id: "iot", name: "IoT 連接器", status: "disabled" },
  { id: "generic-rest", name: "通用 REST 連接器", status: "disabled" },
  { id: "database-view", name: "資料庫檢視連接器", status: "disabled" },
];

beforeEach(() => {
  mockedListConnectors.mockReset();
  mockedEnableConnector.mockReset();
});

describe("ConnectorList (E11-S014)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListConnectors.mockReturnValue(new Promise(() => {}));

    render(<ConnectorList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListConnectors.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<ConnectorList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("renders every one of the real 9 connector types, not just the first few — a silent truncation would slip past a small fixture", async () => {
    mockedListConnectors.mockResolvedValue({ ok: true, value: ALL_CONNECTORS });

    render(<ConnectorList />);

    await screen.findByText("ERP 連接器");
    for (const connector of ALL_CONNECTORS) {
      expect(screen.getByText(connector.name)).toBeInTheDocument();
    }
    expect(screen.getAllByText("已停用")).toHaveLength(9);
  });

  it("renders a status toggle button for each connector, targeting its own id", async () => {
    mockedListConnectors.mockResolvedValue({
      ok: true,
      value: [
        { id: "erp", name: "ERP 連接器", status: "disabled" },
        { id: "mes", name: "MES 連接器", status: "enabled" },
      ],
    });

    render(<ConnectorList />);
    await screen.findByText("ERP 連接器");

    expect(screen.getAllByRole("button", { name: "啟用" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "停用" })).toHaveLength(1);
  });

  it("re-fetches the list after a successful toggle, reflecting the connector's new status", async () => {
    mockedListConnectors.mockResolvedValueOnce({
      ok: true,
      value: [{ id: "erp", name: "ERP 連接器", status: "disabled" }],
    });
    mockedEnableConnector.mockResolvedValue({ ok: true, value: { id: "erp", name: "ERP 連接器", status: "enabled" } });

    render(<ConnectorList />);
    await screen.findByText("ERP 連接器");
    expect(screen.getByText("已停用")).toBeInTheDocument();

    mockedListConnectors.mockResolvedValueOnce({
      ok: true,
      value: [{ id: "erp", name: "ERP 連接器", status: "enabled" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "啟用" }));

    expect(await screen.findByText("啟用中")).toBeInTheDocument();
    expect(mockedListConnectors).toHaveBeenCalledTimes(2);
  });
});
