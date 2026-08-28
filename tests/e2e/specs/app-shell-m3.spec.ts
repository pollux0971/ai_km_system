import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function shell(page: import("@playwright/test").Page) {
  return page.locator(".app-shell");
}

/**
 * E01-S023 AC2: the three M3 navigation breakpoints, verified against a
 * real browser layout — app-shell.test.tsx already covers the same
 * `data-nav-mode` logic at the unit level with a mocked `window.innerWidth`;
 * this is the same behavior through a real viewport resize + real CSS.
 */
test.describe("E01-S023: app shell nav mode", () => {
  test("is 'drawer' at 1440px", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await expect(shell(page)).toHaveAttribute("data-nav-mode", "drawer");
    await expect(page.getByRole("navigation", { name: "主導覽" })).toBeVisible();
  });

  test("is 'rail' at 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 });
    await login(page);
    await expect(shell(page)).toHaveAttribute("data-nav-mode", "rail");
    await expect(page.getByRole("navigation", { name: "主導覽" })).toBeVisible();
  });

  test("is 'modal' at 600px, with a hamburger button that opens the drawer", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await login(page);
    await expect(shell(page)).toHaveAttribute("data-nav-mode", "modal");

    const hamburger = page.getByRole("button", { name: "開啟導覽選單" });
    await expect(hamburger).toBeVisible();
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");

    await hamburger.click();
    await expect(hamburger).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("app-shell-scrim")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(hamburger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("app-shell-scrim")).toHaveCount(0);
    await expect(hamburger).toBeFocused();
  });
});

/** E01-S023 AC5: axe on the home page shell, at the default desktop width. */
test("E01-S023: home page shell has no serious/critical axe violations", async ({ page }) => {
  await login(page);
  await expect(shell(page)).toBeVisible();

  const results = await new AxeBuilder({ page }).include(".app-shell").analyze();
  const seriousOrCritical = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");

  expect(seriousOrCritical, JSON.stringify(seriousOrCritical, null, 2)).toEqual([]);
});
