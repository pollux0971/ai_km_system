import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MaintenanceSession from "./maintenance-session";
import { getMaintenanceCase } from "@/lib/maintenance-cases";
import {
  createDiagnosticSession,
  getDiagnosticSessionForCase,
  goToPreviousStep,
  restartDiagnosticSession,
  selectDecisionOption,
  skipDiagnosticStep,
} from "@/lib/diagnostic-sessions";
import { getCurrentDiagnosticStep } from "@/lib/diagnostic-steps";

vi.mock("@/lib/maintenance-cases", () => ({
  getMaintenanceCase: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
  createDiagnosticSession: vi.fn(),
  selectDecisionOption: vi.fn(),
  goToPreviousStep: vi.fn(),
  restartDiagnosticSession: vi.fn(),
  skipDiagnosticStep: vi.fn(),
}));

const mockedGetMaintenanceCase = vi.mocked(getMaintenanceCase);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);
const mockedCreateDiagnosticSession = vi.mocked(createDiagnosticSession);
const mockedSelectDecisionOption = vi.mocked(selectDecisionOption);
const mockedGoToPreviousStep = vi.mocked(goToPreviousStep);
const mockedRestartDiagnosticSession = vi.mocked(restartDiagnosticSession);
const mockedSkipDiagnosticStep = vi.mocked(skipDiagnosticStep);

const sampleCase = {
  id: "case1",
  title: "空壓機無法啟動",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const sampleSession = {
  id: "session1",
  maintenanceCaseId: "case1",
  status: "OPEN" as const,
  currentStepIndex: 0,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetMaintenanceCase.mockReset();
  mockedGetDiagnosticSessionForCase.mockReset();
  mockedCreateDiagnosticSession.mockReset();
  mockedSelectDecisionOption.mockReset();
  mockedGoToPreviousStep.mockReset();
  mockedRestartDiagnosticSession.mockReset();
  mockedSkipDiagnosticStep.mockReset();
});

describe("MaintenanceSession (E07-S006)", () => {
  it("shows a loading state before the maintenance case resolves", () => {
    mockedGetMaintenanceCase.mockReturnValue(new Promise(() => {}));

    render(<MaintenanceSession id="case1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows a distinct not-found state when the case doesn't exist, and never attempts a session", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: null });

    render(<MaintenanceSession id="not-a-real-case-id" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到您要的內容。");
    expect(mockedGetDiagnosticSessionForCase).not.toHaveBeenCalled();
    expect(mockedCreateDiagnosticSession).not.toHaveBeenCalled();
  });

  it("shows a distinct error state when loading the case fails", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修診斷。");
  });

  it("shows a distinct error state when loading the existing session fails", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修診斷。");
  });

  it("creates a new session at status OPEN when the case has none yet, and shows it", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });
    mockedCreateDiagnosticSession.mockResolvedValue({ ok: true, value: sampleSession });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("heading", { name: "空壓機無法啟動", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("待處理")).toBeInTheDocument();
    expect(mockedCreateDiagnosticSession).toHaveBeenCalledWith("case1");
  });

  it("shows a distinct error state when creating a new session fails", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: null });
    mockedCreateDiagnosticSession.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("無法載入維修診斷。");
  });

  it("resumes an already-existing session instead of creating a second one", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: { ...sampleSession, status: "IN_PROGRESS" },
    });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByText("進行中")).toBeInTheDocument();
    expect(mockedCreateDiagnosticSession).not.toHaveBeenCalled();
  });

  it.each([
    ["RESOLVED", "已解決"],
    ["ESCALATED", "已升級"],
    ["CANCELLED", "已取消"],
  ] as const)("shows the correct Chinese label for status %s", async (status, label) => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: { ...sampleSession, status } });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByText(label)).toBeInTheDocument();
  });

  it("shows a link back to /maintenance", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: sampleSession });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("link", { name: "返回維修助手首頁" })).toHaveAttribute("href", "/maintenance");
  });

  it("E07-S007: shows the current-step card once a session is loaded", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: sampleSession });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByRole("heading", { name: "步驟 1", level: 2 })).toBeInTheDocument();
  });

  it("E07-S008: selecting a decision option advances the session and updates the displayed status and step", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: sampleSession });
    const firstOption = getCurrentDiagnosticStep(0).options?.[0];
    if (!firstOption) throw new Error("step 0 must have at least one option");
    const advancedSession = {
      ...sampleSession,
      status: "IN_PROGRESS" as const,
      currentStepIndex: 1,
      lastSelectedOptionId: firstOption.id,
    };
    mockedSelectDecisionOption.mockResolvedValue({ ok: true, value: advancedSession });

    render(<MaintenanceSession id="case1" />);
    // E07-S017: step 0 now carries a safetyWarning (E07-S016), gating its
    // option/skip buttons behind this checkbox — see current-step-card.tsx's
    // own doc comment. Added here (not a modified assertion) because the
    // real step 0 this test renders now requires it.
    fireEvent.click(await screen.findByLabelText("我已閱讀並了解上述安全警告"));
    const optionButton = screen.getByRole("button", { name: firstOption.label });
    fireEvent.click(optionButton);

    expect(mockedSelectDecisionOption).toHaveBeenCalledWith("session1", firstOption.id);
    expect(await screen.findByRole("heading", { name: "步驟 2", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("進行中")).toBeInTheDocument();
  });

  it("E07-S009: shows a previously recorded free-text detail when the session already has one", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: { ...sampleSession, currentStepIndex: 1, lastFreeTextDetail: "現場有明顯異音" },
    });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByText("現場有明顯異音")).toBeInTheDocument();
  });

  it("E07-S010: clicking 上一步 returns to the previous step's content", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: { ...sampleSession, currentStepIndex: 1, status: "IN_PROGRESS" as const },
    });
    mockedGoToPreviousStep.mockResolvedValue({ ok: true, value: { ...sampleSession, status: "IN_PROGRESS" as const } });

    render(<MaintenanceSession id="case1" />);
    const backButton = await screen.findByRole("button", { name: "上一步" });
    fireEvent.click(backButton);

    expect(mockedGoToPreviousStep).toHaveBeenCalledWith("session1");
    expect(await screen.findByRole("heading", { name: "步驟 1", level: 2 })).toBeInTheDocument();
  });

  it("E07-S011: clicking 重新開始 resets to the first step and 待處理 status", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: { ...sampleSession, currentStepIndex: 1, status: "IN_PROGRESS" as const, lastSelectedOptionId: "resolved" },
    });
    mockedRestartDiagnosticSession.mockResolvedValue({ ok: true, value: sampleSession });

    render(<MaintenanceSession id="case1" />);
    const restartButton = await screen.findByRole("button", { name: "重新開始" });
    fireEvent.click(restartButton);

    expect(mockedRestartDiagnosticSession).toHaveBeenCalledWith("session1");
    expect(await screen.findByRole("heading", { name: "步驟 1", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("待處理")).toBeInTheDocument();
  });

  it("E07-S012: typing a reason and clicking 跳過此步驟 advances the session and shows the recorded reason", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({ ok: true, value: sampleSession });
    const skippedSession = {
      ...sampleSession,
      status: "IN_PROGRESS" as const,
      currentStepIndex: 1,
      lastSkipReason: "現場暫時無法安全接近設備",
    };
    mockedSkipDiagnosticStep.mockResolvedValue({ ok: true, value: skippedSession });

    render(<MaintenanceSession id="case1" />);
    // E07-S017: step 0 now carries a safetyWarning (E07-S016), gating its
    // option/skip buttons behind this checkbox — see current-step-card.tsx's
    // own doc comment. Added here (not a modified assertion) because the
    // real step 0 this test renders now requires it.
    fireEvent.click(await screen.findByLabelText("我已閱讀並了解上述安全警告"));
    fireEvent.change(screen.getByLabelText("略過原因"), { target: { value: "現場暫時無法安全接近設備" } });
    fireEvent.click(screen.getByRole("button", { name: "跳過此步驟" }));

    expect(mockedSkipDiagnosticStep).toHaveBeenCalledWith("session1", "現場暫時無法安全接近設備");
    expect(await screen.findByRole("heading", { name: "步驟 2", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("現場暫時無法安全接近設備")).toBeInTheDocument();
  });

  it("E07-S013: shows a previously recorded photo attachment when the session already has one", async () => {
    mockedGetMaintenanceCase.mockResolvedValue({ ok: true, value: sampleCase });
    mockedGetDiagnosticSessionForCase.mockResolvedValue({
      ok: true,
      value: { ...sampleSession, currentStepIndex: 1, lastPhotoFileName: "現場照片.jpg", lastPhotoSizeBytes: 2_500_000 },
    });

    render(<MaintenanceSession id="case1" />);

    expect(await screen.findByText("現場照片.jpg", { exact: false })).toBeInTheDocument();
  });
});
