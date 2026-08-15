import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import MaintenanceSession from "./maintenance-session";
import { getMaintenanceCase } from "@/lib/maintenance-cases";
import { createDiagnosticSession, getDiagnosticSessionForCase } from "@/lib/diagnostic-sessions";

vi.mock("@/lib/maintenance-cases", () => ({
  getMaintenanceCase: vi.fn(),
}));

vi.mock("@/lib/diagnostic-sessions", () => ({
  getDiagnosticSessionForCase: vi.fn(),
  createDiagnosticSession: vi.fn(),
}));

const mockedGetMaintenanceCase = vi.mocked(getMaintenanceCase);
const mockedGetDiagnosticSessionForCase = vi.mocked(getDiagnosticSessionForCase);
const mockedCreateDiagnosticSession = vi.mocked(createDiagnosticSession);

const sampleCase = {
  id: "case1",
  title: "空壓機無法啟動",
  updatedAt: "2026-08-14T00:00:00.000Z",
};

const sampleSession = {
  id: "session1",
  maintenanceCaseId: "case1",
  status: "OPEN" as const,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
};

beforeEach(() => {
  mockedGetMaintenanceCase.mockReset();
  mockedGetDiagnosticSessionForCase.mockReset();
  mockedCreateDiagnosticSession.mockReset();
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
});
