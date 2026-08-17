import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import FeedbackDetail from "./feedback-detail";
import { getFeedback } from "@/lib/feedback";

vi.mock("@/lib/feedback", () => ({
  getFeedback: vi.fn(),
}));

const mockedGetFeedback = vi.mocked(getFeedback);

const sampleFeedback = {
  id: "f1",
  verdict: "ok" as const,
  reason: "回答完全解決問題",
  submittedAt: "2026-08-17T01:00:00.000Z",
};

describe("FeedbackDetail (E11-S017)", () => {
  it("shows a loading indicator before the fetch resolves", () => {
    mockedGetFeedback.mockReturnValue(new Promise(() => {}));

    render(<FeedbackDetail feedbackId="f1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } });

    render(<FeedbackDetail feedbackId="f1" />);

    expect(await screen.findByText("無法載入回饋資料。")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown feedback id", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: true, value: null });

    render(<FeedbackDetail feedbackId="not-a-real-id" />);

    expect(await screen.findByText("找不到這筆回饋。")).toBeInTheDocument();
  });

  it("shows the feedback's verdict, reason, and submitted-at time once loaded", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: true, value: sampleFeedback });

    render(<FeedbackDetail feedbackId="f1" />);

    expect(await screen.findByText("OK")).toBeInTheDocument();
    expect(screen.getByText("回答完全解決問題")).toBeInTheDocument();
    expect(document.querySelector('time[datetime="2026-08-17T01:00:00.000Z"]')).toBeInTheDocument();
  });

  it("shows an NG verdict distinctly, without a reason paragraph when none was given", async () => {
    mockedGetFeedback.mockResolvedValue({
      ok: true,
      value: { id: "f2", verdict: "ng", submittedAt: "2026-08-17T01:00:00.000Z" },
    });

    render(<FeedbackDetail feedbackId="f2" />);

    expect(await screen.findByText("NG")).toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
    expect(screen.queryByText("回答完全解決問題")).not.toBeInTheDocument();
  });

  it("calls getFeedback with the given feedbackId", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: true, value: sampleFeedback });

    render(<FeedbackDetail feedbackId="f1" />);

    await screen.findByText("OK");
    expect(mockedGetFeedback).toHaveBeenCalledWith("f1");
  });
});
