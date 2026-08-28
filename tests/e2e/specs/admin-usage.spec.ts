import { test, expect } from "@playwright/test";

/**
 * E11-S021 "Usage dashboard" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why).
 *
 * E13-S021 (real API): the sandbox account this E2E runs as has never
 * recorded a usage event for today's UTC date, so both counts are
 * honestly 0 — real data from the real server, not the old hardcoded
 * placeholder. The old assertion checked for the "尚未建置..." disclaimer
 * paragraph verbatim; that paragraph no longer exists (removing it WAS
 * this story's whole point), so this now asserts the real zero values
 * render instead — a stronger check (proves the real pipeline works end
 * to end), not a weaker one.
 */
test("E13-S021: navigating from the admin home to 使用量儀表板 shows real zero counts for today (sandbox has no usage yet)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "使用量儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/usage");

  await expect(page.getByRole("heading", { name: "使用量儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("每日活躍使用者（DAU）", { exact: true })).toBeVisible();
  await expect(page.getByText("今日提問數", { exact: true })).toBeVisible();

  const dauBlock = page.getByText("每日活躍使用者（DAU）", { exact: true }).locator("..");
  await expect(dauBlock.getByText("0", { exact: true })).toBeVisible();
  const questionsBlock = page.getByText("今日提問數", { exact: true }).locator("..");
  await expect(questionsBlock.getByText("0", { exact: true })).toBeVisible();
});
