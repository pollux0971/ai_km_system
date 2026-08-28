import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import UsageDashboard from "./usage-dashboard";
import { getUsageMetrics } from "@/lib/usage-metrics";

vi.mock("@/lib/usage-metrics", () => ({
  getUsageMetrics: vi.fn(),
}));

const mockedGetUsageMetrics = vi.mocked(getUsageMetrics);

describe("UsageDashboard (E11-S021)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetUsageMetrics.mockReturnValue(new Promise(() => {}));

    render(<UsageDashboard />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<UsageDashboard />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("AC2: shows a distinct forbidden message on a 403, not the generic error", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } });

    render(<UsageDashboard />);

    expect(await screen.findByText("您沒有權限查看使用量數據。")).toBeInTheDocument();
  });

  it("shows the daily active users count once loaded", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);

    expect(await screen.findByText("每日活躍使用者（DAU）")).toBeInTheDocument();
    const dauValue = (await screen.findAllByText("0"))[0];
    expect(dauValue).toBeInTheDocument();
  });

  it("shows the questions-asked count once loaded", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);

    expect(await screen.findByText("今日提問數")).toBeInTheDocument();
  });

  it("shows each metric's own distinct value, not the other metric's value copied over", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 3, questionsAsked: 7 } });

    render(<UsageDashboard />);

    await screen.findByText("每日活躍使用者（DAU）");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("binds each value to its own label's own block, not just anywhere on the page — a field-mapping swap would slip past a same-page-anywhere check", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 3, questionsAsked: 7 } });

    render(<UsageDashboard />);

    const dauBlock = (await screen.findByText("每日活躍使用者（DAU）")).closest("div");
    const questionsBlock = screen.getByText("今日提問數").closest("div");
    expect(dauBlock).not.toBeNull();
    expect(questionsBlock).not.toBeNull();

    expect(within(dauBlock!).getByText("3")).toBeInTheDocument();
    expect(within(dauBlock!).queryByText("7")).not.toBeInTheDocument();
    expect(within(questionsBlock!).getByText("7")).toBeInTheDocument();
    expect(within(questionsBlock!).queryByText("3")).not.toBeInTheDocument();
  });
});

describe("UsageDashboard date picker (E13-S021)", () => {
  it("defaults to today's UTC date and passes it to getUsageMetrics", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);
    await screen.findByText("每日活躍使用者（DAU）");

    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(screen.getByLabelText("查詢日期（UTC）")).toHaveValue(todayUtc);
    expect(mockedGetUsageMetrics).toHaveBeenCalledWith(todayUtc);
  });

  it("re-fetches with the new date when the picker changes", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-29", dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);
    await screen.findByText("每日活躍使用者（DAU）");

    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { date: "2026-08-01", dailyActiveUsers: 9, questionsAsked: 4 } });
    fireEvent.change(screen.getByLabelText("查詢日期（UTC）"), { target: { value: "2026-08-01" } });

    await screen.findByText("9");
    expect(mockedGetUsageMetrics).toHaveBeenLastCalledWith("2026-08-01");
  });
});
