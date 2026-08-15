import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CaseDetail from "./case-detail";
import { getMaintenanceCase } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSession } from "@/lib/diagnostic-sessions";

vi.mock("@/lib/maintenance-cases", () => ({
  getMaintenanceCase: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
}));

const mockedGetMaintenanceCase = vi.mocked(getMaintenanceCase);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);

const sampleCase = { id: "case1", title: "生產線 3 號機台異音診斷", updatedAt: "2026-08-14T06:30:00.000Z" };

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

describe("CaseDetail (E07-S021)", () => {
  it("shows a loading state before the case resolves", () => {
    mockedGetMaintenanceCase.mockReturnValue(new Promise(() => {}));

    render(<CaseDetail id="case1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows the case title once loaded", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByRole("heading", { name: "生產線 3 號機台異音診斷", level: 1 })).toBeInTheDocument();
  });

  it("shows a distinct error state when the case fails to load", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修案例。");
  });

  it("shows a distinct not-found state when the case doesn't exist", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("找不到您要的內容。")).toBeInTheDocument();
  });

  it("shows a distinct error state when the diagnostic session lookup fails (fail-closed, matching maintenance-session.tsx's own precedent for this exact fetch pair)", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修案例。");
  });

  it("shows the equipment name when the case has an equipmentId", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: { ...sampleCase, equipmentId: "equip-2" } });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("設備:空壓機 A")).toBeInTheDocument();
  });

  it("shows no equipment line when the case has no equipmentId", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);
    await screen.findByRole("heading", { name: "生產線 3 號機台異音診斷", level: 1 });

    expect(screen.queryByText(/^設備:/)).not.toBeInTheDocument();
  });

  it("shows the serial number and error code when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({
      ok: true,
      value: { ...sampleCase, serialNumber: "SN-2026-0042", errorCode: "E101" },
    });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("序號:SN-2026-0042")).toBeInTheDocument();
    expect(await screen.findByText("錯誤代碼:E101 — 馬達過熱")).toBeInTheDocument();
  });

  it("shows no status line when the case has no diagnostic session yet", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<CaseDetail id="case1" />);
    await screen.findByRole("heading", { name: "生產線 3 號機台異音診斷", level: 1 });

    expect(screen.queryByText(/狀態:/)).not.toBeInTheDocument();
  });

  it("shows the session status once one exists", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "IN_PROGRESS" }) });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("狀態:進行中")).toBeInTheDocument();
  });

  it("shows the recorded free-text detail when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ lastFreeTextDetail: "現場有明顯異音" }),
    });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("補充說明:現場有明顯異音")).toBeInTheDocument();
  });

  it("shows the recorded skip reason when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ lastSkipReason: "現場無法判斷" }),
    });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("略過原因:現場無法判斷")).toBeInTheDocument();
  });

  it("shows the recorded photo filename and formatted size when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ lastPhotoFileName: "photo.jpg", lastPhotoSizeBytes: 2048 }),
    });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("附加照片:photo.jpg(2.0 KB)")).toBeInTheDocument();
  });

  it("shows the recorded completion summary when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ status: "RESOLVED", lastCompletionSummary: "已更換零件並確認設備恢復正常運作" }),
    });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("摘要:已更換零件並確認設備恢復正常運作")).toBeInTheDocument();
  });

  it("shows the recorded escalation reason when present", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ status: "ESCALATED", lastEscalationReason: "現場情況超出可自行處理範圍" }),
    });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByText("原因:現場情況超出可自行處理範圍")).toBeInTheDocument();
  });

  it("always shows a link to the diagnostic session page, regardless of status", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status: "RESOLVED" }) });

    render(<CaseDetail id="case1" />);

    expect(await screen.findByRole("link", { name: "查看診斷內容" })).toHaveAttribute("href", "/maintenance/case1/session");
  });
});
