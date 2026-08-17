import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

  it("shows the daily active users count once loaded", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);

    expect(await screen.findByText("每日活躍使用者（DAU）")).toBeInTheDocument();
    const dauValue = (await screen.findAllByText("0"))[0];
    expect(dauValue).toBeInTheDocument();
  });

  it("shows the questions-asked count once loaded", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);

    expect(await screen.findByText("今日提問數")).toBeInTheDocument();
  });

  it("shows each metric's own distinct value, not the other metric's value copied over", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { dailyActiveUsers: 3, questionsAsked: 7 } });

    render(<UsageDashboard />);

    await screen.findByText("每日活躍使用者（DAU）");
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("binds each value to its own label's own block, not just anywhere on the page — a field-mapping swap would slip past a same-page-anywhere check", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { dailyActiveUsers: 3, questionsAsked: 7 } });

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

  it("shows an explanatory note that no real usage tracking exists yet", async () => {
    mockedGetUsageMetrics.mockResolvedValue({ ok: true, value: { dailyActiveUsers: 0, questionsAsked: 0 } });

    render(<UsageDashboard />);

    expect(await screen.findByText("尚未建置使用量追蹤機制，以上數據皆為零。")).toBeInTheDocument();
  });
});
