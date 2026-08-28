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

  it("AC2: shows a distinct forbidden message on a 403, not the generic error", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("您沒有權限查看延遲數據。")).toBeInTheDocument();
  });

  it("shows the average latency label once loaded", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null, sampleCount: 0 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("平均回應延遲")).toBeInTheDocument();
  });

  it("shows '尚無資料' (not '0ms' or 'null') when averageLatencyMs is null", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null, sampleCount: 0 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("尚無資料")).toBeInTheDocument();
    expect(screen.queryByText("0ms")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows a real numeric average distinctly from the null case, when one is available", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: 1234, sampleCount: 10 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("1234ms")).toBeInTheDocument();
    expect(screen.queryByText("尚無資料")).not.toBeInTheDocument();
  });

  it("shows a real zero-latency average as '0ms', not conflated with the null/no-data case", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: 0, sampleCount: 1 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("0ms")).toBeInTheDocument();
    expect(screen.queryByText("尚無資料")).not.toBeInTheDocument();
  });

  it("AC3 (E13-S021): shows the real sample count alongside the average", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: 1320.5, sampleCount: 84 } });

    render(<LatencyDashboard />);

    expect(await screen.findByText("樣本數")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
  });

  it("shows a zero sample count distinctly, matching the null average it always accompanies", async () => {
    mockedGetLatencyMetrics.mockResolvedValue({ ok: true, value: { averageLatencyMs: null, sampleCount: 0 } });

    render(<LatencyDashboard />);

    await screen.findByText("尚無資料");
    expect(screen.getByText("樣本數").closest("div")).toHaveTextContent("0");
  });
});
