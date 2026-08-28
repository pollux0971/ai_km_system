import { test, expect } from "@playwright/test";

/**
 * E11-S016 "Feedback queue" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why).
 *
 * E13-S021 (real API): `GET /admin/feedback` is DELIBERATELY cross-owner
 * (`services/conversation/src/repository/admin-read.repository.ts`'s own
 * doc comment — that IS the point of an admin feedback queue), and
 * `playwright.config.ts`'s `fullyParallel: true` gives no ordering
 * guarantee across spec FILES. So neither "the queue is empty" (the old
 * assertion) nor "the queue contains this OTHER spec's specific item"
 * can be asserted reliably — both bet on cross-file execution order or
 * on nothing else in the shared E2E database having written real
 * feedback yet, which admin-analytics-real.spec.ts (AC5) now does.
 *
 * The fix: ask the REAL API what's true RIGHT NOW (`page.request.get`
 * shares the browsing context's session cookie — same session the page
 * itself is using), then assert the UI matches it EXACTLY, in either
 * direction. This is order-independent (never assumes 0 or assumes
 * another file already ran) and, unlike an either/or check, catches
 * BOTH failure directions — real data existing but not rendering, and
 * the empty state rendering when real data exists. The always-true
 * empty-state BEHAVIOR itself (exact wording, filter controls hidden,
 * no rate stat) is still fully covered at the component layer —
 * `feedback-list.test.tsx`'s 11 tests, including a literal "尚無回饋。"
 * assertion — which is not order-dependent since it controls its own
 * mocked data.
 */
test("E11-S016: 回饋佇列 renders exactly what the real API returns for this session, empty or not", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");
  await expect(page.getByRole("heading", { name: "回饋佇列", level: 1, exact: true })).toBeVisible();

  const res = await page.request.get("/api/v1/admin/feedback?page=1&pageSize=20");
  expect(res.ok(), `GET /admin/feedback failed: ${res.status()}`).toBe(true);
  const { items, totalCount } = (await res.json()) as { items: unknown[]; totalCount: number };

  if (totalCount === 0) {
    await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(items.length);
  }
});

/**
 * E11-S017 "Feedback detail" — same shape admin-users.spec.ts's own
 * E11-S003 "visiting an unknown user id" test already establishes.
 * Navigating directly (not via a list click) is the only honestly
 * testable path here — the queue above is always empty in production
 * today (feedback.ts's own doc comment explains why), so there is no
 * real feedback item to click into; getFeedback(id) returns null for
 * any id, same as listFeedback() returning an empty list for the same
 * underlying reason.
 */
test("E11-S017: visiting an unknown feedback id shows a distinct not-found state", async ({ page }) => {
  await page.goto("/feedback/this-feedback-does-not-exist");

  await expect(page.getByText("找不到這筆回饋。", { exact: true })).toBeVisible();
});

/**
 * E13-S007 "feedback queue filter" — `feedback-list.tsx`'s own invariant
 * is "filter controls render iff there is something to filter"
 * (`showFilters = items.length > 0 || hasActiveCriteria(criteria)`, and
 * no criteria is active on first load). That invariant holds regardless
 * of how many real items exist, so it's what this test asserts — real
 * data from the real API (see E11-S016's test above for why neither
 * "always empty" nor "this other spec's specific item" is order-safe
 * under `fullyParallel: true`), not a fixed count. Filter *logic* itself
 * (does selecting "OK" actually narrow the results) is proven with
 * fixture data at the lib/component test layers
 * (feedback.test.ts, feedback-list.test.tsx).
 */
test("E13-S007: filter controls render iff the real API returned any items", async ({ page }) => {
  await page.goto("/feedback");

  const res = await page.request.get("/api/v1/admin/feedback?page=1&pageSize=20");
  expect(res.ok(), `GET /admin/feedback failed: ${res.status()}`).toBe(true);
  const { totalCount } = (await res.json()) as { totalCount: number };

  if (totalCount === 0) {
    await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
    await expect(page.getByLabel("依判斷篩選")).toHaveCount(0);
    await expect(page.getByLabel("只顯示有填寫原因的回饋")).toHaveCount(0);
  } else {
    await expect(page.getByLabel("依判斷篩選")).toBeVisible();
    await expect(page.getByLabel("只顯示有填寫原因的回饋")).toBeVisible();
  }
});

/**
 * E13-S008 "feedback detail view" — same honest-negative shape S007's
 * test above already establishes for the queue: the comment and
 * citation-feedback sections only make sense once a real FeedbackItem
 * carries those optional fields (feedback-detail.tsx's own doc comment
 * explains why), and getFeedback(id) is unconditionally null in
 * production today, same underlying reason as every other test in this
 * file. Real coverage here is the honest negative — the not-found page
 * does not leak either new section's markup.
 */
test("E13-S008: the not-found feedback detail page shows no comment or citation-feedback section", async ({
  page,
}) => {
  await page.goto("/feedback/this-feedback-does-not-exist");

  await expect(page.getByText("找不到這筆回饋。", { exact: true })).toBeVisible();
  await expect(page.getByText("留言", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("list", { name: "引用回饋" })).toHaveCount(0);
});

/**
 * E13-S014 "OK/NG rate dashboard" — same invariant-not-count-based shape
 * E13-S007's test above establishes: the rate stat renders iff the real
 * API returned any items on this page (`items.length > 0` in
 * `feedback-list.tsx`), never a fixed 0-or-N assumption (see E11-S016's
 * test above for why neither is order-safe under `fullyParallel: true`).
 * An OK/NG rate has no honest value for zero samples (0/0 is undefined,
 * not 0%) — this still proves the stat correctly disappears exactly when
 * that's true, real data or not.
 */
test("E13-S014: the OK/NG rate stat renders iff the real API returned any items", async ({ page }) => {
  await page.goto("/feedback");

  const res = await page.request.get("/api/v1/admin/feedback?page=1&pageSize=20");
  expect(res.ok(), `GET /admin/feedback failed: ${res.status()}`).toBe(true);
  const { totalCount } = (await res.json()) as { totalCount: number };

  if (totalCount === 0) {
    await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
    await expect(page.getByText(/OK 比例/)).toHaveCount(0);
  } else {
    await expect(page.getByText(/OK 比例/)).toBeVisible();
  }
});
