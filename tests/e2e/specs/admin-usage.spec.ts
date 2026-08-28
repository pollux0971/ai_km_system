import { test, expect } from "@playwright/test";

/**
 * E11-S021 "Usage dashboard" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why).
 *
 * E13-S021 (real API): the old assertion checked for the "尚未建置..."
 * disclaimer paragraph verbatim; that paragraph no longer exists
 * (removing it WAS this story's whole point). A FIRST attempt at this
 * fix hardcoded "both counts are 0 today" — that is only true when
 * nothing else in the same Playwright run has recorded a usage event for
 * today under this shared `demo-super` session yet. `playwright.config.ts`'s
 * `fullyParallel: true` gives no cross-FILE ordering guarantee, and
 * `admin-analytics-real.spec.ts` (AC5) sends a real message under this
 * exact session — so a hardcoded 0 broke (confirmed: this test failed on
 * a real full-suite run once that file existed). Same fix as
 * `admin-feedback.spec.ts`'s own E13-S021 rewrite: ask the real API what
 * is true RIGHT NOW (`page.request.get`, same session cookie), then
 * assert the UI matches it exactly — order-independent, and still a
 * stronger check than the old disclaimer text (proves the real pipeline
 * renders whatever the real count is, not just that some placeholder
 * paragraph exists).
 */
test("E13-S021: 使用量儀表板 renders exactly what the real API returns for today, whatever that is", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "使用量儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/usage");

  await expect(page.getByRole("heading", { name: "使用量儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("每日活躍使用者（DAU）", { exact: true })).toBeVisible();
  await expect(page.getByText("今日提問數", { exact: true })).toBeVisible();

  const today = new Date().toISOString().slice(0, 10);
  const res = await page.request.get(`/api/v1/admin/metrics/usage?date=${today}`);
  expect(res.ok(), `GET /admin/metrics/usage failed: ${res.status()}`).toBe(true);
  const { dailyActiveUsers, questionsAsked } = (await res.json()) as {
    dailyActiveUsers: number;
    questionsAsked: number;
  };

  const dauBlock = page.getByText("每日活躍使用者（DAU）", { exact: true }).locator("..");
  await expect(dauBlock.getByText(String(dailyActiveUsers), { exact: true })).toBeVisible();
  const questionsBlock = page.getByText("今日提問數", { exact: true }).locator("..");
  await expect(questionsBlock.getByText(String(questionsAsked), { exact: true })).toBeVisible();
});
