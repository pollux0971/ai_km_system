import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S016 desktop responsive baseline: no horizontal overflow and all
 * primary chrome elements stay visible across common desktop
 * resolutions. Per SOURCE_BASELINE's older E01-S12 baseline
 * ("支援主要 Desktop Resolution" / GA: "Tablet/Mobile optimization"),
 * tablet/mobile is explicit GA scope — not tested here.
 */
const DESKTOP_RESOLUTIONS = [
  { width: 1280, height: 800, label: "1280x800" },
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1920, height: 1080, label: "1920x1080" },
];

async function hasNoHorizontalOverflow(page: import("@playwright/test").Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

for (const { width, height, label } of DESKTOP_RESOLUTIONS) {
  test(`login page has no horizontal overflow at ${label}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/login");

    await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });

  test(`authenticated app shell has no horizontal overflow and full chrome visible at ${label}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
    await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
    await page.getByRole("button", { name: "登入", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");

    await expect(page.getByRole("navigation", { name: "主導覽" })).toBeVisible();
    await expect(page.getByText("AI KM", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeVisible();
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
  });
}
