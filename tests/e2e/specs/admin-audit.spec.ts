import { test, expect } from "@playwright/test";

/**
 * E11-S015 "Audit viewer" critical seam — same no-session-gate shape
 * admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's doc comment for why). Only the empty state is
 * reachable here (see audit.ts's own doc comment for why) — this
 * honestly exercises exactly that real production state, not an
 * invented populated one.
 */
test("E11-S015: navigating from the admin home to 稽核紀錄 shows the honest empty state — no real audit pipeline exists yet", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("link", { name: "稽核紀錄" }).click();
  await page.waitForURL((url) => url.pathname === "/audit");

  await expect(page.getByRole("heading", { name: "稽核紀錄", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("尚無稽核紀錄。", { exact: true })).toBeVisible();
});
