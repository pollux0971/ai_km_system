import { test, expect } from "@playwright/test";

/**
 * E11-S022 "System health dashboard" critical seam — same no-session-gate
 * shape admin-roles.spec.ts's own S006 test already establishes (see
 * admin-smoke.spec.ts's own doc comment for why).
 *
 * E13-S021 (real API): TWO independent things changed, both a direct
 * consequence of `GET /admin/health` (E04-S047) now being the real data
 * source instead of a 2-item hardcoded placeholder:
 *   1. The subsystems themselves are different — the frozen contract
 *      (`analytics.yaml` `SystemHealth`, E13-S018) names 4 real
 *      subsystems (`api`/`database`/`migrations`/`asr`), not the old
 *      stub's 2 invented ones (`connectors`/`models`). This is not a
 *      renamed status, it is a different, correct set of things being
 *      checked.
 *   2. The old assertion checked for the "尚未建置..." disclaimer
 *      paragraph verbatim; that paragraph no longer exists (removing it
 *      WAS this story's whole point). AC5 requires all 4 to be non-
 *      "unknown" — this asserts exactly that (real "正常" statuses,
 *      including `asr` under the dev environment's fake ASR provider),
 *      a stronger check than "some placeholder text is on the page".
 */
test("E13-S021: navigating from the admin home to 系統健康儀表板 shows all 4 real subsystems, none unknown (AC5)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "系統健康儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/health");

  await expect(page.getByRole("heading", { name: "系統健康儀表板", level: 1, exact: true })).toBeVisible();
  for (const label of ["API 服務", "資料庫", "資料庫遷移", "語音辨識"]) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("狀態未知", { exact: true })).toHaveCount(0);
  await expect(page.getByText("正常", { exact: true })).toHaveCount(4);
});
