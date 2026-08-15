import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MaintenanceHistoryList from "./maintenance-history-list";
import { listMaintenanceCases } from "@/lib/maintenance-cases";
import { getDiagnosticSessionForCase, type DiagnosticSession } from "@/lib/diagnostic-sessions";

vi.mock("@/lib/maintenance-cases", () => ({
  listMaintenanceCases: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
}));

const mockedListMaintenanceCases = vi.mocked(listMaintenanceCases);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);

const case1 = { id: "case1", title: "生產線 3 號機台異音診斷", updatedAt: "2026-08-14T06:30:00.000Z" };

function session(overrides: Partial<DiagnosticSession> = {}): DiagnosticSession {
  return {
    id: "session1",
    maintenanceCaseId: "case1",
    status: "OPEN" as const,
    currentStepIndex: 0,
    createdAt: "2026-08-14T06:00:00.000Z",
    updatedAt: "2026-08-14T06:30:00.000Z",
    ...overrides,
  };
}

describe("MaintenanceHistoryList (E07-S020)", () => {
  it("shows a loading state before the list resolves", () => {
    mockedListMaintenanceCases.mockReturnValue(new Promise(() => {}));

    render(<MaintenanceHistoryList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows each case's title and timestamp once loaded", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText("生產線 3 號機台異音診斷")).toBeInTheDocument();
  });

  it("shows a distinct error state when the case list fails to load", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修歷史。");
  });

  it("shows a distinct error state when a case's diagnostic session lookup fails (fail-closed, not a silent partial success)", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修歷史。");
  });

  it("shows an empty state (not an error) when there are no cases", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [] });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText("尚無維修歷史。")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows no status line for a case that hasn't started a diagnostic session yet", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceHistoryList />);
    await screen.findByText("生產線 3 號機台異音診斷");

    expect(screen.queryByText(/狀態:/)).not.toBeInTheDocument();
  });

  it("renders no links on any case item (E07-S021 owns the not-yet-existing detail route)", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceHistoryList />);
    await screen.findByText("生產線 3 號機台異音診斷");

    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("MaintenanceHistoryList status labels (E07-S020)", () => {
  it.each([
    ["OPEN", "待處理"],
    ["IN_PROGRESS", "進行中"],
    ["ESCALATED", "已升級"],
    ["CANCELLED", "已取消"],
  ] as const)("shows 狀態:%s as 狀態:%s", async (status, label) => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: session({ status }) });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText(`狀態:${label}`)).toBeInTheDocument();
  });

  it("shows 已解決 plus the recorded completion summary for a RESOLVED session", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ status: "RESOLVED", lastCompletionSummary: "已更換零件並確認設備恢復正常運作" }),
    });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText("狀態:已解決")).toBeInTheDocument();
    expect(await screen.findByText("摘要:已更換零件並確認設備恢復正常運作")).toBeInTheDocument();
  });

  it("shows 已升級 plus the recorded escalation reason for an ESCALATED session", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ status: "ESCALATED", lastEscalationReason: "現場情況超出可自行處理範圍" }),
    });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText("狀態:已升級")).toBeInTheDocument();
    expect(await screen.findByText("原因:現場情況超出可自行處理範圍")).toBeInTheDocument();
  });

  it("shows multiple cases each with their own independently-resolved status", async () => {
    const case2 = { id: "case2", title: "包裝機感測器故障排除", updatedAt: "2026-08-13T02:15:00.000Z" };
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1, case2] });
    mockedGetDiagnosticSessionForCase.mockImplementation(async (maintenanceCaseId) => {
      if (maintenanceCaseId === "case1") return { ok: true, value: session({ status: "IN_PROGRESS" }) };
      return { ok: true, value: session({ id: "session2", maintenanceCaseId: "case2", status: "RESOLVED", lastCompletionSummary: "已排除故障" }) };
    });

    render(<MaintenanceHistoryList />);

    expect(await screen.findByText("狀態:進行中")).toBeInTheDocument();
    expect(await screen.findByText("狀態:已解決")).toBeInTheDocument();
    expect(await screen.findByText("摘要:已排除故障")).toBeInTheDocument();
  });

  it("does not let a completion summary and an escalation reason substitute for each other (field-mixup guard)", async () => {
    mockedListMaintenanceCases.mockResolvedValue({ ok: true, value: [case1] });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: session({ status: "RESOLVED", lastCompletionSummary: "已更換零件並確認設備恢復正常運作" }),
    });

    render(<MaintenanceHistoryList />);
    await screen.findByText("摘要:已更換零件並確認設備恢復正常運作");

    expect(screen.queryByText(/^原因:/)).not.toBeInTheDocument();
  });
});
