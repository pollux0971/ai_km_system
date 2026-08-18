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

describe("FeedbackDetail free-text comment (E13-S008)", () => {
  it("shows the free-text comment when the feedback item has one", async () => {
    mockedGetFeedback.mockResolvedValue({
      ok: true,
      value: { ...sampleFeedback, comment: "希望能引用最新版本的政策文件" },
    });

    render(<FeedbackDetail feedbackId="f1" />);

    expect(await screen.findByText("希望能引用最新版本的政策文件")).toBeInTheDocument();
  });

  it("does not render a comment section when the feedback item has no comment", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: true, value: sampleFeedback });

    render(<FeedbackDetail feedbackId="f1" />);

    await screen.findByText("OK");
    expect(screen.queryByText("留言")).not.toBeInTheDocument();
  });
});

describe("FeedbackDetail citation-specific feedback (E13-S008)", () => {
  it("lists each citation's own verdict when citationFeedback is present", async () => {
    mockedGetFeedback.mockResolvedValue({
      ok: true,
      value: {
        ...sampleFeedback,
        citationFeedback: [
          { citationId: "1", verdict: "ok" },
          { citationId: "2", verdict: "ng" },
        ],
      },
    });

    render(<FeedbackDetail feedbackId="f1" />);

    await screen.findByText("OK");
    const list = screen.getByRole("list", { name: "引用回饋" });
    expect(list).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("引用 1");
    expect(items[0]).toHaveTextContent("OK");
    expect(items[1]).toHaveTextContent("引用 2");
    expect(items[1]).toHaveTextContent("NG");
  });

  it("does not render a citation-feedback section when citationFeedback is absent", async () => {
    mockedGetFeedback.mockResolvedValue({ ok: true, value: sampleFeedback });

    render(<FeedbackDetail feedbackId="f1" />);

    await screen.findByText("OK");
    expect(screen.queryByRole("list", { name: "引用回饋" })).not.toBeInTheDocument();
  });

  it("does not render a citation-feedback section when citationFeedback is an empty array", async () => {
    mockedGetFeedback.mockResolvedValue({
      ok: true,
      value: { ...sampleFeedback, citationFeedback: [] },
    });

    render(<FeedbackDetail feedbackId="f1" />);

    await screen.findByText("OK");
    expect(screen.queryByRole("list", { name: "引用回饋" })).not.toBeInTheDocument();
  });
});
