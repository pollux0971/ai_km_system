import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S026 critical flow: archiving/unarchiving a conversation from its
 * detail page, and the conversation list's active/archived view switch.
 * Navigation after login always uses in-app link clicks, never
 * page.goto() — see conversations.spec.ts's file doc comment for why.
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

async function openConversation(page: import("@playwright/test").Page, title: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: title }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
}

test("E03-S026: archiving a conversation moves it from the active list to the archived view, and unarchiving reverses it", async ({
  page,
}) => {
  await openConversation(page, "設備 E-204 錯誤代碼排查");

  await page.getByRole("button", { name: "封存對話" }).click();
  await expect(page.getByRole("button", { name: "取消封存" })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await expect(page.getByText("設備 E-204 錯誤代碼排查")).toHaveCount(0);

  await page.getByRole("button", { name: "已封存對話" }).click();
  await expect(page.getByText("設備 E-204 錯誤代碼排查")).toBeVisible();

  await page.getByRole("link", { name: "設備 E-204 錯誤代碼排查" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  await page.getByRole("button", { name: "取消封存" }).click();
  await expect(page.getByRole("button", { name: "封存對話" })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await expect(page.getByText("設備 E-204 錯誤代碼排查")).toBeVisible();
});

test("E03-S026: an archived conversation no longer appears in the Home Dashboard's Recent Conversations widget", async ({
  page,
}) => {
  await openConversation(page, "設備 E-204 錯誤代碼排查");

  await page.getByRole("button", { name: "封存對話" }).click();
  await expect(page.getByRole("button", { name: "取消封存" })).toBeVisible();

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByText("設備 E-204 錯誤代碼排查")).toHaveCount(0);
});
