import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S003 critical flow: creating a knowledge base through the
 * "新增知識庫" entry point (this story's own addition to /knowledge,
 * deliberately deferred by E05-S001/S002). Navigation after login
 * always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why.
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

async function openKnowledgeList(page: import("@playwright/test").Page) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
}

test("E05-S003: creating a knowledge base with a name adds it to the list and lands back on /knowledge", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByRole("link", { name: "新增知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge/new");

  await page.getByLabel("知識庫名稱").fill("客服部門知識庫");
  await page.getByLabel("說明").fill("常見客服問答與處理流程。");
  await page.getByRole("button", { name: "建立" }).click();

  await page.waitForURL((url) => url.pathname === "/knowledge");
  await expect(page.getByRole("heading", { name: "知識庫", level: 1 })).toBeVisible();
  await expect(page.getByText("客服部門知識庫")).toBeVisible();
});

test("E05-S003: the submit button stays disabled until a name is entered, so an empty name cannot be submitted", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByRole("link", { name: "新增知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge/new");

  await expect(page.getByRole("button", { name: "建立" })).toBeDisabled();
  await page.getByLabel("知識庫名稱").fill("   ");
  await expect(page.getByRole("button", { name: "建立" })).toBeDisabled();
  await expect(page).toHaveURL((url) => url.pathname === "/knowledge/new");
});

test("E05-S003: the cancel link returns to /knowledge without creating anything", async ({ page }) => {
  await openKnowledgeList(page);

  await page.getByRole("link", { name: "新增知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge/new");

  await page.getByLabel("知識庫名稱").fill("不應該被建立的知識庫");
  await page.getByRole("link", { name: "取消" }).click();

  await page.waitForURL((url) => url.pathname === "/knowledge");
  await expect(page.getByText("不應該被建立的知識庫")).toHaveCount(0);
});
