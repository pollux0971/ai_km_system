import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FeedbackList from "./feedback-list";
import { listFeedback } from "@/lib/feedback";

vi.mock("@/lib/feedback", () => ({
  listFeedback: vi.fn(),
}));

const mockedListFeedback = vi.mocked(listFeedback);

describe("FeedbackList (E11-S016)", () => {
  it("shows a loading indicator before the list resolves", () => {
    mockedListFeedback.mockReturnValue(new Promise(() => {}));

    render(<FeedbackList />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedListFeedback.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<FeedbackList />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("shows an empty state when there is no feedback — the real production state today", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: [] });

    render(<FeedbackList />);

    expect(await screen.findByText("尚無回饋。")).toBeInTheDocument();
  });

  it("shows an OK item's own verdict and reason once loaded", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);

    expect(await screen.findByText("OK")).toBeInTheDocument();
    expect(screen.getByText("回答完全解決問題")).toBeInTheDocument();
  });

  it("shows an NG item's own verdict, distinct from OK", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ng", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);

    expect(await screen.findByText("NG")).toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("does not render a reason paragraph when the item has none", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ng", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);
    await screen.findByText("NG");

    expect(screen.queryByText("回答完全解決問題")).not.toBeInTheDocument();
  });

  it("renders every item it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const reasons = ["原因 0", "原因 1", "原因 2", "原因 3", "原因 4"];
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: reasons.map((reason, index) => ({
        id: `f${index}`,
        verdict: index % 2 === 0 ? ("ok" as const) : ("ng" as const),
        reason,
        submittedAt: "2026-08-17T01:00:00.000Z",
      })),
    });

    render(<FeedbackList />);

    await screen.findByText("原因 0");
    for (const reason of reasons) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  it("shows each item's own submitted-at time", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);
    await screen.findByText("OK");

    expect(document.querySelector('time[datetime="2026-08-17T01:00:00.000Z"]')).toBeInTheDocument();
  });

  it("does not show the empty state once feedback is loaded", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);

    await screen.findByText("OK");
    expect(screen.queryByText("尚無回饋。")).not.toBeInTheDocument();
  });
});
