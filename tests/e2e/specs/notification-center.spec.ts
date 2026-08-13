import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S014 critical flow: the notification center's trigger + panel.
 */
test("notification center shows an unread count and lists notifications when opened", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  const trigger = page.getByRole("button", { name: "通知（2）" });
  await expect(trigger).toBeVisible();

  await expect(page.getByRole("dialog", { name: "通知中心" })).not.toBeVisible();
  await trigger.click();

  const panel = page.getByRole("dialog", { name: "通知中心" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("知識庫「產品保固政策」已更新")).toBeVisible();
  await expect(panel.getByText("系統將於本週六進行例行維護")).toBeVisible();
});
