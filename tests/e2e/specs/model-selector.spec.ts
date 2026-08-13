import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S005 critical flow: the AI model selector, visible only while a
 * conversation is in Advanced mode. Navigation after login always uses
 * in-app link clicks, never page.goto() — see conversations.spec.ts's
 * file doc comment for why (the mock AuthClient's session is a plain
 * in-memory closure variable with no cookie/localStorage backing; a hard
 * reload wipes it).
 */

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("帳號").fill(MOCK_VALID_USERNAME);
  await page.getByLabel("密碼").fill(MOCK_VALID_PASSWORD);
  await page.getByRole("button", { name: "登入", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

function sidebarNav(page: import("@playwright/test").Page) {
  return page.getByRole("navigation", { name: "主導覽" });
}

test("E03-S005: an advanced-mode conversation shows the model selector with its current model", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "Q3 銷售報表彙整" is mode "advanced", model "advanced-local".
  await page.getByRole("link", { name: "Q3 銷售報表彙整" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("combobox", { name: "AI 模型" })).toHaveValue("advanced-local");
});

test("E03-S005: a normal-mode conversation hides the model selector until switched to advanced", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "產品保固政策詢問" is mode "normal", model "standard".
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("combobox", { name: "AI 模型" })).not.toBeVisible();

  await page.getByRole("button", { name: "進階模式" }).click();

  await expect(page.getByRole("combobox", { name: "AI 模型" })).toHaveValue("standard");
});

test("E03-S005: switching the model persists across leaving and returning to the conversation", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "Q3 銷售報表彙整" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  const conversationUrl = page.url();

  await expect(page.getByRole("combobox", { name: "AI 模型" })).toHaveValue("advanced-local");
  await page.getByRole("combobox", { name: "AI 模型" }).selectOption("standard");
  await expect(page.getByRole("combobox", { name: "AI 模型" })).toHaveValue("standard");

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "Q3 銷售報表彙整" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByRole("combobox", { name: "AI 模型" })).toHaveValue("standard");
});

test("E03-S005: the cloud model option is visible but disabled", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  await page.getByRole("link", { name: "Q3 銷售報表彙整" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("option", { name: "雲端模型（尚未啟用）" })).toBeDisabled();
});
