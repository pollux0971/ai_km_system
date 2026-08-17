import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SystemHealthDashboard from "./system-health-dashboard";
import { getSystemHealth } from "@/lib/system-health";

vi.mock("@/lib/system-health", () => ({
  getSystemHealth: vi.fn(),
}));

const mockedGetSystemHealth = vi.mocked(getSystemHealth);

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

  it("shows every subsystem it's given, each with its own 狀態未知 label, once loaded", async () => {
    mockedGetSystemHealth.mockResolvedValue({
      ok: true,
      value: [
        { id: "connectors", name: "連接器", status: "unknown" },
        { id: "models", name: "模型服務", status: "unknown" },
      ],
    });

    render(<SystemHealthDashboard />);

    await screen.findByText("連接器");
    expect(screen.getByText("模型服務")).toBeInTheDocument();
    expect(screen.getAllByText("狀態未知")).toHaveLength(2);
  });

  it("renders every subsystem it's given, not just the first — a silent truncation would slip past a 2-item fixture", async () => {
    mockedGetSystemHealth.mockResolvedValue({
      ok: true,
      value: [
        { id: "s1", name: "子系統 1", status: "unknown" },
        { id: "s2", name: "子系統 2", status: "unknown" },
        { id: "s3", name: "子系統 3", status: "unknown" },
        { id: "s4", name: "子系統 4", status: "unknown" },
      ],
    });

    render(<SystemHealthDashboard />);

    await screen.findByText("子系統 1");
    for (const name of ["子系統 1", "子系統 2", "子系統 3", "子系統 4"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("shows an explanatory note that unknown does not mean broken", async () => {
    mockedGetSystemHealth.mockResolvedValue({
      ok: true,
      value: [{ id: "connectors", name: "連接器", status: "unknown" }],
    });

    render(<SystemHealthDashboard />);

    expect(
      await screen.findByText("尚未建置真正的健康檢查機制，以上狀態皆為「未知」，不代表系統異常。"),
    ).toBeInTheDocument();
  });
});
