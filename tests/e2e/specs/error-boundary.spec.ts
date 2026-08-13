import { test, expect } from "@playwright/test";

/**
 * E01-S018 app-level error boundary. /debug-throw is a deliberate
 * test-only fixture (apps/web/src/app/debug-throw/page.tsx) that exists
 * solely to give this test something real to catch — an error boundary
 * only exists to handle UNPLANNED crashes, so there is no real product
 * page that would otherwise exercise it. The fixture is inert (404s) in
 * a real production build.
 */
test("E01-S018: a rendering crash is caught by the app-level error boundary instead of a blank page", async ({
  page,
}) => {
  await page.goto("/debug-throw");

  await expect(page.getByRole("heading", { name: "發生未預期的錯誤" })).toBeVisible();
  // Next.js injects its own role="alert" route announcer on every page
  // (id="__next-route-announcer__"), so asserting via getByRole("alert")
  // here would be ambiguous — match the exact established copy instead,
  // same pattern login.spec.ts already uses for ErrorMessage assertions.
  await expect(page.getByText("系統發生錯誤，請稍後再試。")).toBeVisible();
  // The raw error message must never reach the user.
  await expect(page.getByText("deliberate test error", { exact: false })).not.toBeVisible();
  await expect(page.getByRole("button", { name: "重試" })).toBeVisible();
  await expect(page.getByRole("link", { name: "回首頁" })).toBeVisible();
});
