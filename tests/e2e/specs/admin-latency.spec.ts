import { test, expect } from "@playwright/test";

/**
 * E13-S013 "Latency dashboard" critical seam — same no-session-gate
 * shape admin-usage.spec.ts's own E11-S021 test already establishes
 * (see admin-smoke.spec.ts's own doc comment for why).
 *
 * E13-S021 (real API): the sandbox account this E2E runs as has never
 * recorded a `rag_answer_outcome` usage event, so the real server
 * genuinely returns `averageLatencyMs: null, sampleCount: 0` — "尚無資料"
 * is still correct, now for the real reason (zero real samples) rather
 * than the only possible outcome. The old assertion checked for the
 * "尚未建置..." disclaimer paragraph verbatim; that paragraph no longer
 * exists (removing it WAS this story's whole point), so this now
 * additionally asserts the real sample count (0) renders — a stronger
 * check, not a weaker one.
 */
test("E13-S021: navigating from the admin home to 延遲儀表板 shows real no-data state with a 0 sample count", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "延遲儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/latency");

  await expect(page.getByRole("heading", { name: "延遲儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("平均回應延遲", { exact: true })).toBeVisible();
  await expect(page.getByText("尚無資料", { exact: true })).toBeVisible();
  await expect(page.getByText("樣本數", { exact: true })).toBeVisible();
  const sampleCountBlock = page.getByText("樣本數", { exact: true }).locator("..");
  await expect(sampleCountBlock.getByText("0", { exact: true })).toBeVisible();
});
