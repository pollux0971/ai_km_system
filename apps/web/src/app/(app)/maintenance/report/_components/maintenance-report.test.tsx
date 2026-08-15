import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MaintenanceReport, { casesToCsv } from "./maintenance-report";
import { listMaintenanceCases } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSession } from "@/lib/diagnostic-sessions";
import { trackEvent } from "@/lib/telemetry";

vi.mock("@/lib/maintenance-cases", () => ({
  listMaintenanceCases: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
}));

vi.mock("@/lib/telemetry", () => ({
  trackEvent: vi.fn(),
}));

const mockedListMaintenanceCases = vi.mocked(listMaintenanceCases);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);
const mockedTrackEvent = vi.mocked(trackEvent);

beforeEach(() => {
  mockedTrackEvent.mockClear();
});

const case1 = { id: "case1", title: "生產線 3 號機台異音診斷", updatedAt: "2026-08-14T06:30:00.000Z" };

function session(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
  return {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "OPEN",
    currentStepIndex: 0,
    createdAt: "2026-08-14T06:00:00.000Z",
    updatedAt: "2026-08-14T06:30:00.000Z",
    ...overrides,
  };
}

describe("casesToCsv (E07-S022)", () => {
  it("renders the header row alone for an empty list", () => {
    expect(casesToCsv([])).toBe("案例標題,設備,序號,錯誤代碼,狀態,更新時間");
  });

  it("renders one row with all fields present", () => {
    const csv = casesToCsv([
      {
        title: "測試案例",
        equipmentName: "空壓機 A",
        serialNumber: "SN-0042",
        errorCode: "E101",
        statusLabel: "已解決",
        updatedAt: "2026-08-14T06:30:00.000Z",
      },
    ]);

    expect(csv).toBe(
      "案例標題,設備,序號,錯誤代碼,狀態,更新時間\r\n測試案例,空壓機 A,SN-0042,E101,已解決,2026-08-14T06:30:00.000Z",
    );
  });

  it("renders empty strings for absent optional fields", () => {
    const csv = casesToCsv([{ title: "測試案例", statusLabel: "尚未開始", updatedAt: "2026-08-14T06:30:00.000Z" }]);

    expect(csv).toBe("案例標題,設備,序號,錯誤代碼,狀態,更新時間\r\n測試案例,,,,尚未開始,2026-08-14T06:30:00.000Z");
  });

  it("quotes and escapes a field containing a comma", () => {
    const csv = casesToCsv([{ title: "異音,漏氣", statusLabel: "待處理", updatedAt: "2026-08-14T06:30:00.000Z" }]);

    expect(csv).toContain('"異音,漏氣"');
  });

  it("quotes a field containing an embedded newline, so it doesn't fracture the CSV's own row structure", () => {
    // Reachable in practice, not a purely theoretical edge case:
    // createMaintenanceCase's own problemDescription?.trim() only strips
    // leading/trailing whitespace, never internal newlines — a pasted
    // multi-line problem description becomes `title` verbatim.
    const csv = casesToCsv([{ title: "第一行\n第二行", statusLabel: "待處理", updatedAt: "2026-08-14T06:30:00.000Z" }]);
    const rows = csv.split("\r\n");

    expect(csv).toContain('"第一行\n第二行"');
    expect(rows).toHaveLength(2);
  });

  it("quotes and doubles internal quotes for a field containing a quote character", () => {
    const csv = casesToCsv([{ title: '標題"含引號"', statusLabel: "待處理", updatedAt: "2026-08-14T06:30:00.000Z" }]);

    expect(csv).toContain('"標題""含引號"""');
  });

  it("joins multiple rows with CRLF", () => {
    const csv = casesToCsv([
      { title: "案例一", statusLabel: "待處理", updatedAt: "2026-08-14T06:30:00.000Z" },
      { title: "案例二", statusLabel: "已解決", updatedAt: "2026-08-13T06:30:00.000Z" },
    ]);

    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("MaintenanceReport (E07-S022)", () => {
  it("shows a loading state before the report resolves", () => {
    mockedListMaintenanceCases.mockReturnValue(new Promise(() => {}));

    render(<MaintenanceReport />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct error state when the case list fails to load", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceReport />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修報表。");
  });

  it("shows a distinct error state when a diagnostic session lookup fails (fail-closed)", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceReport />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修報表。");
  });

  it("shows the total case count", async () => {
    const case2 = { id: "case2", title: "包裝機感測器故障排除", updatedAt: "2026-08-13T02:15:00.000Z" };
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1, case2] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceReport />);

    expect(await screen.findByText("案例總數:2")).toBeInTheDocument();
  });

  it("counts a case with no diagnostic session yet under 尚未開始", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceReport />);

    expect(await screen.findByText("尚未開始:1")).toBeInTheDocument();
    expect(screen.getByText("待處理:0")).toBeInTheDocument();
  });

  it("buckets cases by their real diagnostic status independently", async () => {
    const case2 = { id: "case2", title: "包裝機感測器故障排除", updatedAt: "2026-08-13T02:15:00.000Z" };
    const case3 = { id: "case3", title: "空壓機無法啟動", updatedAt: "2026-08-12T02:15:00.000Z" };
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1, case2, case3] });
    mockedGetDiagnosticSessionForCase.mockImplementation(async (maintenanceCaseId) => {
      if (maintenanceCaseId === "case1") return { ok: true, value: session({ status: "RESOLVED" }) };
      if (maintenanceCaseId === "case2") return { ok: true, value: session({ id: "s2", maintenanceCaseId: "case2", status: "ESCALATED" }) };
      return { ok: true, value: session({ id: "s3", maintenanceCaseId: "case3", status: "IN_PROGRESS" }) };
    });

    render(<MaintenanceReport />);

    expect(await screen.findByText("已解決:1")).toBeInTheDocument();
    expect(screen.getByText("已升級:1")).toBeInTheDocument();
    expect(screen.getByText("進行中:1")).toBeInTheDocument();
    expect(screen.getByText("待處理:0")).toBeInTheDocument();
    expect(screen.getByText("已取消:0")).toBeInTheDocument();
    expect(screen.getByText("尚未開始:0")).toBeInTheDocument();
  });

  it("renders a 匯出 CSV download link pointing at a data: URI containing the case data", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "OPEN" }) });

    render(<MaintenanceReport />);

    const link = await screen.findByRole("link", { name: "匯出 CSV" });
    expect(link).toHaveAttribute("download", "maintenance-report.csv");
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("data:text/csv;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(href.replace("data:text/csv;charset=utf-8,", ""))).toContain("生產線 3 號機台異音診斷");
  });

  it("emits a maintenance_report_export telemetry event when the export link is clicked", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceReport />);
    const link = await screen.findByRole("link", { name: "匯出 CSV" });

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(mockedTrackEvent).toHaveBeenCalledWith(
      "maintenance_report_export",
      expect.objectContaining({ properties: expect.objectContaining({ caseCount: 1 }) }),
    );
  });
});
