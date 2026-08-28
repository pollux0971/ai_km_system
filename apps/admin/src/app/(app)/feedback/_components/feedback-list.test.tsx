import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FeedbackList from "./feedback-list";
import { listFeedback, type FeedbackItem, type FeedbackPage, type ListFeedbackOptions } from "@/lib/feedback";
import type { ApiError, Result } from "@ai-km/types";

vi.mock("@/lib/feedback", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feedback")>();
  return {
    ...actual,
    listFeedback: vi.fn(),
  };
});

const mockedListFeedback = vi.mocked(listFeedback);

/** `messageId`/`conversationId`/`answerExcerpt` (E13-S021) are irrelevant to every assertion below — filled with plausible defaults so fixtures only state what they actually vary. */
function item(overrides: Pick<FeedbackItem, "id" | "verdict" | "submittedAt"> & Partial<FeedbackItem>): FeedbackItem {
  return { messageId: overrides.id, conversationId: "conv-1", answerExcerpt: "摘要", ...overrides };
}

function page(items: FeedbackItem[], overrides: Partial<FeedbackPage> = {}): Result<FeedbackPage, ApiError> {
  return {
    ok: true,
    value: { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1, ...overrides },
  };
}

/**
 * Simulates the REAL server's filtering (E13-S021: `listFeedback` now
 * sends `verdict`/`hasReason` as query parameters instead of filtering
 * client-side) — lets the "queue filter" tests below keep asserting real
 * rendered behavior end-to-end (change the dropdown -> see the right
 * items) rather than only "was called with the right options", without
 * duplicating the server-side filtering logic's own tests
 * (`admin-read.repository.test.ts`, `feedback.test.ts`).
 */
function serverLike(items: FeedbackItem[]) {
  return async (options: ListFeedbackOptions = {}): Promise<Result<FeedbackPage, ApiError>> => {
    let filtered = items;
    if (options.verdict !== undefined) filtered = filtered.filter((entry) => entry.verdict === options.verdict);
    if (options.hasReason !== undefined) {
      filtered = filtered.filter((entry) => (entry.reason != null && entry.reason !== "") === options.hasReason);
    }
    return page(filtered, { totalCount: filtered.length });
  };
}

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

  it("AC2: shows a distinct forbidden message on a 403, not the generic error", async () => {
    mockedListFeedback.mockResolvedValue({ ok: false, error: { code: "PERMISSION_DENIED", message: "denied" } });

    render(<FeedbackList />);

    expect(await screen.findByText("您沒有權限查看回饋佇列。")).toBeInTheDocument();
  });

  it("shows an empty state when there is no feedback — the real production state today", async () => {
    mockedListFeedback.mockResolvedValue(page([]));

    render(<FeedbackList />);

    expect(await screen.findByText("尚無回饋。")).toBeInTheDocument();
  });

  it("shows an OK item's own verdict and reason once loaded", async () => {
    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" })]),
    );

    render(<FeedbackList />);

    expect(await screen.findByText("OK")).toBeInTheDocument();
    expect(screen.getByText("回答完全解決問題")).toBeInTheDocument();
  });

  it("shows an NG item's own verdict, distinct from OK", async () => {
    mockedListFeedback.mockResolvedValue(page([item({ id: "f1", verdict: "ng", submittedAt: "2026-08-17T01:00:00.000Z" })]));

    render(<FeedbackList />);

    expect(await screen.findByText("NG")).toBeInTheDocument();
    expect(screen.queryByText("OK")).not.toBeInTheDocument();
  });

  it("does not render a reason paragraph when the item has none", async () => {
    mockedListFeedback.mockResolvedValue(page([item({ id: "f1", verdict: "ng", submittedAt: "2026-08-17T01:00:00.000Z" })]));

    render(<FeedbackList />);
    await screen.findByText("NG");

    expect(screen.queryByText("回答完全解決問題")).not.toBeInTheDocument();
  });

  it("renders every item it's given, not just the first few — a silent truncation would slip past a small fixture", async () => {
    const reasons = ["原因 0", "原因 1", "原因 2", "原因 3", "原因 4"];
    mockedListFeedback.mockResolvedValue(
      page(
        reasons.map((reason, index) =>
          item({ id: `f${index}`, verdict: index % 2 === 0 ? "ok" : "ng", reason, submittedAt: "2026-08-17T01:00:00.000Z" }),
        ),
      ),
    );

    render(<FeedbackList />);

    await screen.findByText("原因 0");
    for (const reason of reasons) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }
  });

  it("shows each item's own submitted-at time", async () => {
    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" })]),
    );

    render(<FeedbackList />);
    await screen.findByText("OK");

    expect(document.querySelector('time[datetime="2026-08-17T01:00:00.000Z"]')).toBeInTheDocument();
  });

  it("does not show the empty state once feedback is loaded", async () => {
    mockedListFeedback.mockResolvedValue(page([item({ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" })]));

    render(<FeedbackList />);

    await screen.findByText("OK");
    expect(screen.queryByText("尚無回饋。")).not.toBeInTheDocument();
  });
});

describe("FeedbackList links to detail pages (E11-S017)", () => {
  it("links each feedback item's own row to its /feedback/{id} detail page, now that route exists", async () => {
    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" })]),
    );

    render(<FeedbackList />);

    const link = await screen.findByRole("link", { name: /OK/ });
    expect(link).toHaveAttribute("href", "/feedback/f1");
  });
});

describe("FeedbackList pagination (E13-S021)", () => {
  it("does not show pagination controls when there is only one page", async () => {
    mockedListFeedback.mockResolvedValue(page([item({ id: "f1", verdict: "ok", submittedAt: "t1" })], { totalPages: 1 }));

    render(<FeedbackList />);
    await screen.findByText("OK");

    expect(screen.queryByRole("navigation", { name: "回饋佇列分頁" })).not.toBeInTheDocument();
  });

  it("shows pagination controls and requests the next page on click", async () => {
    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f1", verdict: "ok", submittedAt: "t1" })], { page: 1, totalPages: 2 }),
    );

    render(<FeedbackList />);
    await screen.findByText("第 1 頁,共 2 頁");

    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f2", verdict: "ng", submittedAt: "t2" })], { page: 2, totalPages: 2 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));

    await screen.findByText("第 2 頁,共 2 頁");
    expect(mockedListFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it("changing a filter resets back to page 1", async () => {
    mockedListFeedback.mockResolvedValue(
      page([item({ id: "f1", verdict: "ok", submittedAt: "t1" })], { page: 1, totalPages: 2 }),
    );

    render(<FeedbackList />);
    await screen.findByText("第 1 頁,共 2 頁");

    mockedListFeedback.mockResolvedValue(page([item({ id: "f2", verdict: "ng", submittedAt: "t2" })], { page: 2, totalPages: 2 }));
    fireEvent.click(screen.getByRole("button", { name: "下一頁" }));
    await screen.findByText("第 2 頁,共 2 頁");

    mockedListFeedback.mockResolvedValue(page([item({ id: "f1", verdict: "ok", submittedAt: "t1" })], { page: 1, totalPages: 1 }));
    fireEvent.change(await screen.findByLabelText("依判斷篩選"), { target: { value: "ok" } });

    await screen.findByText("OK");
    expect(mockedListFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: "ok", page: 1 }));
  });
});

describe("FeedbackList queue filter (E13-S007, server-side as of E13-S021)", () => {
  const MIXED: FeedbackItem[] = [
    item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }),
    item({ id: "f2", verdict: "ng", reason: "答案不正確", submittedAt: "2026-08-17T02:00:00.000Z" }),
    item({ id: "f3", verdict: "ok", submittedAt: "2026-08-17T03:00:00.000Z" }),
    item({ id: "f4", verdict: "ng", submittedAt: "2026-08-17T04:00:00.000Z" }),
  ];

  it("shows filter controls once the list has loaded", async () => {
    mockedListFeedback.mockResolvedValue(page(MIXED));

    render(<FeedbackList />);

    expect(await screen.findByLabelText("依判斷篩選")).toBeInTheDocument();
    expect(screen.getByLabelText("只顯示有填寫原因的回饋")).toBeInTheDocument();
  });

  it("does not show filter controls while the genuinely-empty production state is showing", async () => {
    mockedListFeedback.mockResolvedValue(page([]));

    render(<FeedbackList />);

    await screen.findByText("尚無回饋。");
    expect(screen.queryByLabelText("依判斷篩選")).not.toBeInTheDocument();
  });

  it("requests only OK items when 依判斷篩選 is set to OK (server-side filter, real values simulated)", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ok" } });

    const list = within(await screen.findByRole("list"));
    expect(list.getAllByText("OK")).toHaveLength(2);
    expect(list.queryByText("NG")).not.toBeInTheDocument();
    expect(mockedListFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ verdict: "ok" }));
  });

  it("requests only NG items when 依判斷篩選 is set to NG", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });

    const list = within(await screen.findByRole("list"));
    expect(list.getAllByText("NG")).toHaveLength(2);
    expect(list.queryByText("OK")).not.toBeInTheDocument();
  });

  it("requests every item again after switching 依判斷篩選 back to 全部", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ok" } });
    await screen.findByText("OK 比例:100%(OK 2 / NG 0,本頁共 2 筆)");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "" } });

    const list = within(await screen.findByRole("list"));
    await screen.findByText("OK 比例:50%(OK 2 / NG 2,本頁共 4 筆)");
    expect(list.getAllByText("OK")).toHaveLength(2);
    expect(list.getAllByText("NG")).toHaveLength(2);
  });

  it("requests only items with a reason when 只顯示有填寫原因的回饋 is checked", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("只顯示有填寫原因的回饋");

    fireEvent.click(screen.getByLabelText("只顯示有填寫原因的回饋"));

    const list = within(await screen.findByRole("list"));
    expect(list.getByText("回答完全解決問題")).toBeInTheDocument();
    expect(list.getByText("答案不正確")).toBeInTheDocument();
    expect(list.getAllByText(/^(OK|NG)$/)).toHaveLength(2);
  });

  it("combines verdict and reason filters (intersection, not union)", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });
    await screen.findByLabelText("只顯示有填寫原因的回饋");
    fireEvent.click(screen.getByLabelText("只顯示有填寫原因的回饋"));

    const list = within(await screen.findByRole("list"));
    expect(list.getByText("答案不正確")).toBeInTheDocument();
    expect(list.getAllByText(/^(OK|NG)$/)).toHaveLength(1);
  });

  it("shows a distinct no-match message (not the genuine-empty-queue message) when a filter matches nothing", async () => {
    mockedListFeedback.mockImplementation(serverLike([item({ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" })]));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ng" } });

    expect(await screen.findByText("沒有符合篩選條件的回饋。")).toBeInTheDocument();
    expect(screen.queryByText("尚無回饋。")).not.toBeInTheDocument();
  });
});

describe("FeedbackList OK/NG rate stat (E13-S014, per-page as of E13-S021)", () => {
  const MIXED: FeedbackItem[] = [
    item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }),
    item({ id: "f2", verdict: "ng", reason: "答案不正確", submittedAt: "2026-08-17T02:00:00.000Z" }),
    item({ id: "f3", verdict: "ok", submittedAt: "2026-08-17T03:00:00.000Z" }),
  ];

  it("shows the OK rate computed from the current page's items once loaded", async () => {
    mockedListFeedback.mockResolvedValue(page(MIXED));

    render(<FeedbackList />);

    expect(await screen.findByText("OK 比例:67%(OK 2 / NG 1,本頁共 3 筆)")).toBeInTheDocument();
  });

  it("updates the rate stat when a filter changes the returned page — E13-S021: this is now a per-page metric, not a whole-queue one (no aggregate endpoint in the frozen contract)", async () => {
    mockedListFeedback.mockImplementation(serverLike(MIXED));

    render(<FeedbackList />);
    await screen.findByLabelText("依判斷篩選");
    await screen.findByText("OK 比例:67%(OK 2 / NG 1,本頁共 3 筆)");

    fireEvent.change(screen.getByLabelText("依判斷篩選"), { target: { value: "ok" } });

    expect(await screen.findByText("OK 比例:100%(OK 2 / NG 0,本頁共 2 筆)")).toBeInTheDocument();
  });

  it("does not show the rate stat while the genuinely-empty production state is showing", async () => {
    mockedListFeedback.mockResolvedValue(page([]));

    render(<FeedbackList />);

    await screen.findByText("尚無回饋。");
    expect(screen.queryByText(/OK 比例/)).not.toBeInTheDocument();
  });
});
