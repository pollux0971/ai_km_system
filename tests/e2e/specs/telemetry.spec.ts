import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S019 frontend telemetry hooks. Detailed correctness (exact event
 * shape, correlation id reuse/generation) is unit-tested in
 * apps/web/src/lib/telemetry.test.ts and use-page-view-telemetry.test.ts
 * — this proves the real wiring actually fires in a real browser, by
 * observing the console output createLogger produces (the same stable
 * `[scope] message` format every logger call in this codebase already
 * uses).
 */
test("E01-S019: navigating pages and logging in emit page_view and login_* telemetry events", async ({ page }) => {
  const consoleText: string[] = [];
  page.on("console", (msg) => consoleText.push(msg.text()));

  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const telemetryLines = consoleText.filter((line) => line.startsWith("[web:telemetry]"));
  expect(telemetryLines.some((line) => line.includes("telemetry: page_view"))).toBe(true);
  expect(telemetryLines.some((line) => line.includes("telemetry: login_attempt"))).toBe(true);
  expect(telemetryLines.some((line) => line.includes("telemetry: login_success"))).toBe(true);
});

test("E01-S019: a failed login emits login_failure telemetry instead of login_success", async ({ page }) => {
  const consoleText: string[] = [];
  page.on("console", (msg) => consoleText.push(msg.text()));

  await page.goto("/login");
  await page.getByLabel("帳號").fill("wrong-user");
  await page.getByLabel("密碼").fill("wrong-password");
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await expect(page.getByText("帳號或密碼錯誤。")).toBeVisible();

  const telemetryLines = consoleText.filter((line) => line.startsWith("[web:telemetry]"));
  expect(telemetryLines.some((line) => line.includes("telemetry: login_failure"))).toBe(true);
  expect(telemetryLines.some((line) => line.includes("telemetry: login_success"))).toBe(false);
});
