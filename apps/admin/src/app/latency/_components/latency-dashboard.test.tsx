import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import LatencyDashboard from "./latency-dashboard";
import { getLatencyMetrics } from "@/lib/latency-metrics";

vi.mock("@/lib/latency-metrics", () => ({
  getLatencyMetrics: vi.fn(),
}));

const mockedGetLatencyMetrics = vi.mocked(getLatencyMetrics);

describe("LatencyDashboard (E13-S013)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetLatencyMetrics.mockReturnValue(new Promise(() => {}));

    render(<LatencyDashboard />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<LatencyDashboard />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows the average latency label once loaded", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("平均回應延遲")).toBeInTheDocument();
  });

  it("shows '尚無資料' (not '0ms' or 'null') when averageLatencyMs is null", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("尚無資料")).toBeInTheDocument();
    expect(screen.queryByText("0ms")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows a real numeric average distinctly from the null case, when one is available", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: 1234 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("1234ms")).toBeInTheDocument();
    expect(screen.queryByText("尚無資料")).not.toBeInTheDocument();
  });

  it("shows a real zero-latency average as '0ms', not conflated with the null/no-data case", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: 0 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("0ms")).toBeInTheDocument();
    expect(screen.queryByText("尚無資料")).not.toBeInTheDocument();
  });

  it("shows an explanatory note that no real cross-app data pipeline exists yet", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("尚未建置跨應用資料管道，無法顯示真實延遲數據。")).toBeInTheDocument();
  });
});
