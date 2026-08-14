import { test, expect } from "@playwright/test";
import { MOCK_VALID_PASSWORD, MOCK_VALID_USERNAME } from "@ai-km/auth-client";

/**
 * E05-S016 critical flow: configuring folder sync for a knowledge base
 * via the text input + checkbox at /knowledge/[id]/folder-sync, and
 * confirming the detail page (E05-S005) reflects it. Navigation after
 * login always uses in-app link clicks, never page.goto() — see
 * conversations.spec.ts's file doc comment for why (the mock
 * AuthClient's session is a plain in-memory closure variable;
 * page.goto() is a hard reload that wipes it).
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

async function openKnowledgeDetail(page: import("@playwright/test").Page, name: string) {
  await login(page);
  await sidebarNav(page).getByRole("link", { name: "知識庫" }).click();
  await page.waitForURL((url) => url.pathname === "/knowledge");
  await page.getByRole("link", { name }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
}

test("E05-S016: configuring and enabling folder sync saves it and the detail page shows 已啟用", async ({ page }) => {
  await openKnowledgeDetail(page, "產品保固政策");

  const summary = page.getByText("資料夾同步:", { exact: false });
  await expect(summary).toContainText("尚未設定");

  await page.getByRole("link", { name: "資料夾同步設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/folder-sync$/.test(url.pathname));

  await page.getByLabel("資料夾路徑").fill("/mnt/shared/warranty-policies");
  await page.getByLabel("啟用資料夾同步").check();
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));

  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("已啟用");
});

test("E05-S016: enabling sync without a path shows a specific error and does not save", async ({ page }) => {
  await openKnowledgeDetail(page, "設備維修標準作業程序");

  await page.getByRole("link", { name: "資料夾同步設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/folder-sync$/.test(url.pathname));

  await page.getByLabel("啟用資料夾同步").check();
  await page.getByRole("button", { name: "儲存" }).click();

  // Scoped to <main> — an unscoped getByRole("alert") also matches
  // Next.js's own hidden route-announcer div, same collision
  // knowledge-create.spec.ts (E05-S003) first documented.
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("啟用資料夾同步前，請先輸入資料夾路徑。");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("尚未設定");
});

test("E05-S016: disabling a previously-enabled sync keeps the saved path and shows 已停用", async ({ page }) => {
  await openKnowledgeDetail(page, "人力資源與請假規範");
  await page.getByRole("link", { name: "資料夾同步設定" }).click();
  await page.waitForURL((url) => /^\/knowledge\/.+\/folder-sync$/.test(url.pathname));

  await page.getByLabel("資料夾路徑").fill("/mnt/shared/hr-docs");
  await page.getByLabel("啟用資料夾同步").check();
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");

  await page.getByLabel("啟用資料夾同步").uncheck();
  await page.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByRole("status")).toHaveText("已儲存。");
  await expect(page.getByLabel("資料夾路徑")).toHaveValue("/mnt/shared/hr-docs");

  await page.getByRole("link", { name: "返回知識庫詳情" }).click();
  await page.waitForURL((url) => /^\/knowledge\/[^/]+$/.test(url.pathname));
  await expect(page.getByText("資料夾同步:", { exact: false })).toContainText("已停用");
});
