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
