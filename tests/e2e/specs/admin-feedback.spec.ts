import { test, expect } from "@playwright/test";

/**
 * E11-S016 "Feedback queue" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). Only the empty state is
 * reachable here (see feedback.ts's own doc comment for why — E13's
 * own feedback submission mechanism hasn't been built yet) — this
 * honestly exercises exactly that real production state.
 */
test("E11-S016: navigating from the admin home to 回饋佇列 shows the honest empty state — no real feedback submission mechanism exists yet", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "回饋佇列" }).click();
  await page.waitForURL((url) => url.pathname === "/feedback");

  await expect(page.getByRole("heading", { name: "回饋佇列", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
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
 * E13-S007 "feedback queue filter" — the filter controls only make sense
 * once there is something to filter (feedback-list.tsx's own doc comment
 * explains why); real production coverage here is the honest negative:
 * the genuinely-empty queue (the only real state today, same underlying
 * reason as E11-S016's test above) does NOT show filter controls at all,
 * rather than showing a filter UI with nothing behind it. Filter *logic*
 * itself is proven with fixture data at the lib/component test layers
 * (feedback.test.ts, feedback-list.test.tsx) — there is no honest way to
 * exercise it end-to-end while listFeedback() always returns [].
 */
test("E13-S007: the genuinely-empty feedback queue shows no filter controls", async ({ page }) => {
  await page.goto("/feedback");

  await expect(page.getByText("尚無回饋。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("依判斷篩選")).toHaveCount(0);
  await expect(page.getByLabel("只顯示有填寫原因的回饋")).toHaveCount(0);
});
