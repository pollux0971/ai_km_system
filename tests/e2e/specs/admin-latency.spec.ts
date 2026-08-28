import { test, expect } from "@playwright/test";

/**
 * E13-S013 "Latency dashboard" critical seam — same no-session-gate
 * shape admin-usage.spec.ts's own E11-S021 test already establishes
 * (see admin-smoke.spec.ts's own doc comment for why).
 *
 * E13-S021 (real API): the old assertion checked for the "尚未建置..."
 * disclaimer paragraph verbatim; that paragraph no longer exists
 * (removing it WAS this story's whole point). A FIRST attempt at this
 * fix hardcoded "sampleCount is 0" — only true when nothing else in the
 * same Playwright run has recorded a `rag_answer_outcome` event under
 * this shared `demo-super` session yet. `admin-analytics-real.spec.ts`
 * (AC5) does exactly that, and `fullyParallel: true` gives no cross-file
 * ordering guarantee — confirmed broken on a real full-suite run. Same
 * fix as `admin-usage.spec.ts`'s own E13-S021 rewrite: ask the real API
 * (`page.request.get`, same session cookie) for the current truth, then
 * assert the UI matches it exactly, whatever it is.
 */
test("E13-S021: 延遲儀表板 renders exactly what the real API returns, whatever that is", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: "延遲儀表板" }).click();
  await page.waitForURL((url) => url.pathname === "/latency");

  await expect(page.getByRole("heading", { name: "延遲儀表板", level: 1, exact: true })).toBeVisible();
  await expect(page.getByText("平均回應延遲", { exact: true })).toBeVisible();
  await expect(page.getByText("樣本數", { exact: true })).toBeVisible();

  const res = await page.request.get("/api/v1/admin/metrics/latency");
  expect(res.ok(), `GET /admin/metrics/latency failed: ${res.status()}`).toBe(true);
  const { averageLatencyMs, sampleCount } = (await res.json()) as {
    averageLatencyMs: number | null;
    sampleCount: number;
  };

  if (averageLatencyMs === null) {
    await expect(page.getByText("尚無資料", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(`${averageLatencyMs}ms`, { exact: true })).toBeVisible();
  }
  const sampleCountBlock = page.getByText("樣本數", { exact: true }).locator("..");
  await expect(sampleCountBlock.getByText(String(sampleCount), { exact: true })).toBeVisible();
});
