import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FeedbackList from "./feedback-list";
import { listFeedback } from "@/lib/feedback";

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feedback")>();
  return {
    ...actual,
    listFeedback: vi.fn(),
  };
});

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

describe("FeedbackList links to detail pages (E11-S017)", () => {
  it("links each feedback item's own row to its /feedback/{id} detail page, now that route exists", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);

    const link = await screen.findByRole("link", { name: /OK/ });
    expect(link).toHaveAttribute("href", "/feedback/f1");
  });
});

describe("FeedbackList queue filter (E13-S007)", () => {
  const MIXED: import("@/lib/feedback").FeedbackItem[] = [
    { id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" },
    { id: "f2", verdict: "ng", reason: "答案不正確", submittedAt: "2026-08-17T02:00:00.000Z" },
    { id: "f3", verdict: "ok", submittedAt: "2026-08-17T03:00:00.000Z" },
    { id: "f4", verdict: "ng", submittedAt: "2026-08-17T04:00:00.000Z" },
  ];

  it("shows filter controls once the list has loaded", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);

    expect(await screen.findByLabelText("依判斷篩選")).toBeInTheDocument();
    expect(screen.getByLabelText("只顯示有填寫原因的回饋")).toBeInTheDocument();
  });

  it("does not show filter controls while the genuinely-empty production state is showing", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: [] });

    render(<FeedbackList />);

    await screen.findByText("尚無回饋。");
    expect(screen.queryByLabelText("依判斷篩選")).not.toBeInTheDocument();
  });

  it("filters out NG items when 依判斷篩選 is set to OK", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ok" } });

    const list = within(screen.getByRole("list"));
    expect(list.getAllByText("OK")).toHaveLength(2);
    expect(list.queryByText("NG")).not.toBeInTheDocument();
  });

  it("filters out OK items when 依判斷篩選 is set to NG", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });

    const list = within(screen.getByRole("list"));
    expect(list.getAllByText("NG")).toHaveLength(2);
    expect(list.queryByText("OK")).not.toBeInTheDocument();
  });

  it("shows every item again after switching 依判斷篩選 back to 全部", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ok" } });
    expect(within(screen.getByRole("list")).queryByText("NG")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "" } });

    const list = within(screen.getByRole("list"));
    expect(list.getAllByText("OK")).toHaveLength(2);
    expect(list.getAllByText("NG")).toHaveLength(2);
  });

  it("keeps only items with a reason when 只顯示有填寫原因的回饋 is checked", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);
    await screen.findByLabelText("只顯示有填寫原因的回饋");

    fireEvent.click(screen.getByLabelText("只顯示有填寫原因的回饋"));

    const list = within(screen.getByRole("list"));
    expect(list.getByText("回答完全解決問題")).toBeInTheDocument();
    expect(list.getByText("答案不正確")).toBeInTheDocument();
    expect(list.getAllByText(/^(OK|NG)$/)).toHaveLength(2);
  });

  it("combines verdict and reason filters (intersection, not union)", async () => {
    mockedListFeedback.mockResolvedValue({ ok: true, value: MIXED });

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });
    fireEvent.click(screen.getByLabelText("只顯示有填寫原因的回饋"));

    const list = within(screen.getByRole("list"));
    expect(list.getByText("答案不正確")).toBeInTheDocument();
    expect(list.getAllByText(/^(OK|NG)$/)).toHaveLength(1);
  });

  it("shows a distinct no-match message (not the genuine-empty-queue message) when a filter matches nothing", async () => {
    mockedListFeedback.mockResolvedValue({
      ok: true,
      value: [{ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" }],
    });

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });

    expect(await screen.findByText("沒有符合篩選條件的回饋。")).toBeInTheDocument();
    expect(screen.queryByText("尚無回饋。")).not.toBeInTheDocument();
  });
});
