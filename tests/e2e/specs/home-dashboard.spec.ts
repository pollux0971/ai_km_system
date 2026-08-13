import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USER_ID, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E01-S007/E01-S008 critical flow: the home dashboard's own content
 * (greeting + Recent Conversations widget), distinct from the shell
 * chrome E01-S005 covers.
 */
test("home dashboard greets the user and shows the 快速入口 placeholder section", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await expect(page.getByRole("heading", { name: "歡迎回來", level: 1 })).toBeVisible();
  await expect(page.getByText(`${MOCK_VALID_USER_ID}，這是你的工作台首頁。`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "快速入口", level: 2 })).toBeVisible();
});

test("E01-S008: Recent Conversations widget shows sample conversations and a view-all link", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await expect(page.getByRole("heading", { name: "最近對話", level: 2 })).toBeVisible();
  await expect(page.getByText("產品保固政策詢問")).toBeVisible();
  await expect(page.getByRole("link", { name: "查看全部對話" })).toHaveAttribute("href", "/conversations");
});
