import { describe, expect, it } from "vitest";
import { computeOkNgRate, filterFeedback, getFeedback, listFeedback, type FeedbackItem } from "./feedback";
import { failNextRequest, setFeedbackItems, type FakeFeedbackItem } from "@/test/fake-api";

/**
 * `messageId`/`conversationId`/`answerExcerpt` (E13-S021) are required by
 * the contract but irrelevant to every test below that predates them
 * (`filterFeedback`/`computeOkNgRate` never read them) — this helper fills
 * plausible defaults so each fixture only needs to state the fields it
 * actually varies, same as before E13-S021.
 */
function item(overrides: Pick<FeedbackItem, "id" | "verdict" | "submittedAt"> & Partial<FeedbackItem>): FeedbackItem {
  return {
    messageId: overrides.id,
    conversationId: "11111111-1111-1111-1111-111111111111",
    answerExcerpt: "回答摘要",
    ...overrides,
  };
}

function fakeItem(overrides: Pick<FakeFeedbackItem, "id" | "verdict" | "submittedAt"> & Partial<FakeFeedbackItem>): FakeFeedbackItem {
  return {
    messageId: overrides.id,
    conversationId: "11111111-1111-1111-1111-111111111111",
    answerExcerpt: "回答摘要",
    ...overrides,
  };
}

describe("listFeedback (E11-S016, E13-S021 real API)", () => {
  it("AC1: returns the real feedback queue from the server", async () => {
    setFeedbackItems([fakeItem({ id: "f1", verdict: "ng", reason: "INCORRECT", submittedAt: "2026-08-17T02:00:00.000Z" })]);

    const result = await listFeedback();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toHaveLength(1);
    expect(result.value.items[0]!.id).toBe("f1");
  });

  it("returns an empty page when the queue is genuinely empty", async () => {
    const result = await listFeedback();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items).toEqual([]);
    expect(result.value.totalCount).toBe(0);
  });

  it("AC2: a 403 from the server surfaces as a PERMISSION_DENIED error, not an empty page", async () => {
    failNextRequest("feedback-list", 403, "PERMISSION_DENIED");

    const result = await listFeedback();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });

  it("passes verdict/hasReason/page/pageSize through as real query parameters", async () => {
    setFeedbackItems([
      fakeItem({ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" }),
      fakeItem({ id: "f2", verdict: "ng", submittedAt: "2026-08-17T02:00:00.000Z" }),
    ]);

    const result = await listFeedback({ verdict: "ok" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.items.map((i) => i.id)).toEqual(["f1"]);
  });
});

describe("getFeedback (E11-S017, E13-S021 real API)", () => {
  it("returns the real feedback item for an id that exists", async () => {
    setFeedbackItems([fakeItem({ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" })]);

    const result = await getFeedback("f1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value?.id).toBe("f1");
  });

  it("returns null for an id that does not exist (404 from the server)", async () => {
    const result = await getFeedback("nonexistent");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("AC2: a 403 from the server surfaces as a PERMISSION_DENIED error, not null", async () => {
    failNextRequest("feedback-item", 403, "PERMISSION_DENIED");

    const result = await getFeedback("f1");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PERMISSION_DENIED");
  });
});

describe("filterFeedback (E13-S007)", () => {
  const FIXTURE: FeedbackItem[] = [
    item({ id: "f1", verdict: "ok", reason: "回答完全解決問題", submittedAt: "2026-08-17T01:00:00.000Z" }),
    item({ id: "f2", verdict: "ng", reason: "答案不正確", submittedAt: "2026-08-17T02:00:00.000Z" }),
    item({ id: "f3", verdict: "ok", submittedAt: "2026-08-17T03:00:00.000Z" }),
    item({ id: "f4", verdict: "ng", submittedAt: "2026-08-17T04:00:00.000Z" }),
  ];

  it("returns every item unchanged when no criteria are given", () => {
    expect(filterFeedback(FIXTURE, {})).toEqual(FIXTURE);
  });

  it("keeps only OK items when filtered by verdict ok", () => {
    const result = filterFeedback(FIXTURE, { verdict: "ok" });

    expect(result.map((entry) => entry.id)).toEqual(["f1", "f3"]);
  });

  it("keeps only NG items when filtered by verdict ng", () => {
    const result = filterFeedback(FIXTURE, { verdict: "ng" });

    expect(result.map((entry) => entry.id)).toEqual(["f2", "f4"]);
  });

  it("keeps only items with a non-empty reason when hasReason is true", () => {
    const result = filterFeedback(FIXTURE, { hasReason: true });

    expect(result.map((entry) => entry.id)).toEqual(["f1", "f2"]);
  });

  it("keeps only items without a reason when hasReason is false", () => {
    const result = filterFeedback(FIXTURE, { hasReason: false });

    expect(result.map((entry) => entry.id)).toEqual(["f3", "f4"]);
  });

  it("intersects verdict and hasReason when both are given", () => {
    const result = filterFeedback(FIXTURE, { verdict: "ng", hasReason: true });

    expect(result.map((entry) => entry.id)).toEqual(["f2"]);
  });

  it("returns an empty array unchanged, regardless of criteria — today's real production input", () => {
    expect(filterFeedback([], { verdict: "ok" })).toEqual([]);
  });

  it("returns an empty array when no item matches the criteria", () => {
    const oksOnly: FeedbackItem[] = [item({ id: "f1", verdict: "ok", submittedAt: "2026-08-17T01:00:00.000Z" })];

    expect(filterFeedback(oksOnly, { verdict: "ng" })).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const copy = [...FIXTURE];

    filterFeedback(FIXTURE, { verdict: "ok" });

    expect(FIXTURE).toEqual(copy);
  });
});

describe("computeOkNgRate (E13-S014)", () => {
  it("returns a null rate and zero counts for an empty array — today's real production input, no natural rate for zero samples", () => {
    expect(computeOkNgRate([])).toEqual({ okCount: 0, ngCount: 0, okRatePercent: null });
  });

  it("returns 100% when every item is OK", () => {
    const items: FeedbackItem[] = [
      item({ id: "f1", verdict: "ok", submittedAt: "2026-08-18T00:00:00.000Z" }),
      item({ id: "f2", verdict: "ok", submittedAt: "2026-08-18T01:00:00.000Z" }),
    ];

    expect(computeOkNgRate(items)).toEqual({ okCount: 2, ngCount: 0, okRatePercent: 100 });
  });

  it("returns 0% when every item is NG", () => {
    const items: FeedbackItem[] = [item({ id: "f1", verdict: "ng", submittedAt: "2026-08-18T00:00:00.000Z" })];

    expect(computeOkNgRate(items)).toEqual({ okCount: 0, ngCount: 1, okRatePercent: 0 });
  });

  it("computes a rounded percentage for a mixed set (2 OK / 1 NG rounds 66.67% to 67%)", () => {
    const items: FeedbackItem[] = [
      item({ id: "f1", verdict: "ok", submittedAt: "2026-08-18T00:00:00.000Z" }),
      item({ id: "f2", verdict: "ok", submittedAt: "2026-08-18T01:00:00.000Z" }),
      item({ id: "f3", verdict: "ng", submittedAt: "2026-08-18T02:00:00.000Z" }),
    ];

    expect(computeOkNgRate(items)).toEqual({ okCount: 2, ngCount: 1, okRatePercent: 67 });
  });

  it("counts every item exactly once, not just the first few — a silent truncation would slip past a small fixture", () => {
    const items: FeedbackItem[] = Array.from({ length: 7 }, (_, index) =>
      item({ id: `f${index}`, verdict: index < 5 ? "ok" : "ng", submittedAt: "2026-08-18T00:00:00.000Z" }),
    );

    expect(computeOkNgRate(items)).toEqual({ okCount: 5, ngCount: 2, okRatePercent: 71 });
  });

  it("does not mutate the input array", () => {
    const items: FeedbackItem[] = [
      item({ id: "f1", verdict: "ok", submittedAt: "2026-08-18T00:00:00.000Z" }),
      item({ id: "f2", verdict: "ng", submittedAt: "2026-08-18T01:00:00.000Z" }),
    ];
    const copy = [...items];

    computeOkNgRate(items);

    expect(items).toEqual(copy);
  });
});

describe("FeedbackItem free-text comment and citation-specific feedback shape (E13-S008)", () => {
  it("accepts a FeedbackItem with a comment and citationFeedback, both optional", () => {
    const withBoth: FeedbackItem = item({
      id: "f5",
      verdict: "ng",
      reason: "答案不正確",
      comment: "第二段引用的資料已經過期",
      citationFeedback: [
        { citationId: "1", verdict: "ok" },
        { citationId: "2", verdict: "ng" },
      ],
      submittedAt: "2026-08-18T00:00:00.000Z",
    });

    expect(withBoth.comment).toBe("第二段引用的資料已經過期");
    expect(withBoth.citationFeedback).toHaveLength(2);
  });

  it("still accepts a FeedbackItem with neither comment nor citationFeedback — both remain optional, matching E11-S016's original shape", () => {
    const bareMinimum: FeedbackItem = item({ id: "f6", verdict: "ok", submittedAt: "2026-08-18T00:00:00.000Z" });

    expect(bareMinimum.comment).toBeUndefined();
    expect(bareMinimum.citationFeedback).toBeUndefined();
  });
});
