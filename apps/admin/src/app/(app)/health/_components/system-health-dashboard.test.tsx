import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemHealthDashboard from "./system-health-dashboard";
import { getSystemHealth, type SystemHealth } from "@/lib/system-health";

vi.mock("@/lib/system-health", () => ({
  getSystemHealth: vi.fn(),
}));

const mockedGetSystemHealth = vi.mocked(getSystemHealth);

const ALL_OK: SystemHealth = {
  checkedAt: "2026-08-29T00:00:00.000Z",
  subsystems: [
    { name: "api", status: "ok" },
    { name: "database", status: "ok" },
    { name: "migrations", status: "ok" },
    { name: "asr", status: "ok" },
  ],
};

describe("SystemHealthDashboard (E11-S022)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetSystemHealth.mockReturnValue(new Promise(() => {}));

    render(<SystemHealthDashboard />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetSystemHealth.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<SystemHealthDashboard />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("AC2: shows a distinct forbidden message on a 403, not the generic error", async () => {
    mockedGetSystemHealth.mockResolvedValue({ ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } });

    render(<SystemHealthDashboard />);

    expect(await screen.findByText("您沒有權限查看系統健康狀態。")).toBeInTheDocument();
  });

  it("AC5 (E13-S021): shows all 4 real subsystems, each with a non-\"狀態未知\" label, when every check passes", async () => {
    mockedGetSystemHealth.mockResolvedValue({ ok: true, value: ALL_OK });

    render(<SystemHealthDashboard />);

    await screen.findByText("API 服務");
    for (const label of ["API 服務", "資料庫", "資料庫遷移", "語音辨識"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText("正常")).toHaveLength(4);
    expect(screen.queryByText("狀態未知")).not.toBeInTheDocument();
  });

  it("renders every subsystem it's given, not just the first — a silent truncation would slip past a 4-item fixture", async () => {
    mockedGetSystemHealth.mockResolvedValue({ ok: true, value: ALL_OK });

    render(<SystemHealthDashboard />);

    await screen.findByText("API 服務");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("shows a degraded subsystem's own status and detail, distinct from the others", async () => {
    mockedGetSystemHealth.mockResolvedValue({
      ok: true,
      value: {
        checkedAt: "2026-08-29T00:00:00.000Z",
        subsystems: [
          { name: "api", status: "ok" },
          { name: "database", status: "ok" },
          { name: "migrations", status: "ok" },
          { name: "asr", status: "degraded", detail: "whisper-server 未回應健康檢查。" },
        ],
      },
    });

    render(<SystemHealthDashboard />);

    await screen.findByText("語音辨識");
    expect(screen.getByText("部分異常")).toBeInTheDocument();
    expect(screen.getByText("whisper-server 未回應健康檢查。")).toBeInTheDocument();
    expect(screen.getAllByText("正常")).toHaveLength(3);
  });

  it("shows a down subsystem distinctly from degraded", async () => {
    mockedGetSystemHealth.mockResolvedValue({
      ok: true,
      value: {
        checkedAt: "2026-08-29T00:00:00.000Z",
        subsystems: [{ name: "database", status: "down", detail: "connection refused" }],
      },
    });

    render(<SystemHealthDashboard />);

    expect(await screen.findByText("中斷")).toBeInTheDocument();
    expect(screen.queryByText("部分異常")).not.toBeInTheDocument();
  });

  it("shows the checked-at time", async () => {
    mockedGetSystemHealth.mockResolvedValue({ ok: true, value: ALL_OK });

    render(<SystemHealthDashboard />);

    await screen.findByText("API 服務");
    expect(document.querySelector('time[datetime="2026-08-29T00:00:00.000Z"]')).toBeInTheDocument();
  });
});
