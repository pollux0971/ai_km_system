import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E03-S003 critical flow: the conversation detail page's knowledge
 * scope selector. Navigation after login always uses in-app link
 * clicks, never page.goto() — see conversations.spec.ts's file doc
 * comment for why.
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

test("E03-S003: opening a conversation shows its pre-selected knowledge scope", async ({ page }) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "產品保固政策詢問" has knowledgeScope "company".
  await page.getByRole("link", { name: "產品保固政策詢問" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));

  await expect(page.getByRole("combobox", { name: "知識來源" })).toHaveValue("company");
});

test("E03-S003: switching knowledge scope persists across leaving and returning to the conversation", async ({
  page,
}) => {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");

  // Seed data: "設備 E-204 錯誤代碼排查" has no knowledge scope selected.
  await page.getByRole("link", { name: "設備 E-204 錯誤代碼排查" }).click();
  await page.waitForURL((url) => /^\/conversations\/.+/.test(url.pathname));
  const conversationUrl = page.url();

  const select = page.getByRole("combobox", { name: "知識來源" });
  await expect(select).toHaveValue("");

  await select.selectOption("qna");
  await expect(select).toHaveValue("qna");

  await sidebarNav(page).getByRole("link", { name: "首頁" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await sidebarNav(page).getByRole("link", { name: "對話" }).click();
  await page.waitForURL((url) => url.pathname === "/conversations");
  await page.getByRole("link", { name: "設備 E-204 錯誤代碼排查" }).click();
  await page.waitForURL(conversationUrl);

  await expect(page.getByRole("combobox", { name: "知識來源" })).toHaveValue("qna");
});
